const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const youtubeDl = require('youtube-dl-exec');
const { v4: uuidv4 } = require('uuid');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'dwi1xpx9h',
  api_key: '534381816734129',
  api_secret: '59nE43-Fw6ohqnnmSkMIJFqK5L0'
});

const app = express();
const PORT = 3002;

const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json());
app.use('/downloads', express.static(DOWNLOADS_DIR));

// ─── Helpers ────────────────────────────────────────────────────────────────

function checkFfmpeg() {
  return new Promise((resolve) => {
    exec('ffmpeg -version', (err) => resolve(!err));
  });
}

function detectPlatform(url) {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/tiktok\.com/i.test(url)) return 'tiktok';
  return 'other';
}

function parseVtt(vttContent) {
  const lines = vttContent.split('\n');
  const cleanedLines = [];
  let lastLine = '';

  for (const line of lines) {
    if (
      line.includes('-->') ||
      line.startsWith('WEBVTT') ||
      line.startsWith('Kind:') ||
      line.startsWith('Language:') ||
      /^\d+$/.test(line.trim())
    ) continue;

    const cleaned = line
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();

    if (cleaned && cleaned !== lastLine) {
      cleanedLines.push(cleaned);
      lastLine = cleaned;
    }
  }

  return cleanedLines.join('\n');
}

/**
 * Run yt-dlp directly via child_process using execFile to avoid
 * cmd.exe quoting and interpolation bugs.
 * Returns a Promise that resolves when yt-dlp exits.
 */
function runYtDlp(args, cwd) {
  // Path to the bundled yt-dlp binary inside youtube-dl-exec
  const ytDlpBin = path.resolve(__dirname, 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp.exe');

  return new Promise((resolve) => {
    const { execFile } = require('child_process');
    console.log(`[yt-dlp] Running with execFile...`);

    execFile(ytDlpBin, args, { cwd, timeout: 60000 }, (err, stdout, stderr) => {
      if (stdout) console.log('[yt-dlp stdout]', stdout.slice(0, 500));
      if (stderr) console.log('[yt-dlp stderr]', stderr.slice(0, 500));
      resolve({ err, stdout, stderr });
    });
  });
}

// ─── Routes ─────────────────────────────────────────────────────────────────

app.get('/api/info', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const info = await youtubeDl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noPlaylist: true,
      addHeader: [
        'referer:https://www.google.com/',
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'accept-language:es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7',
      ],
    });

    const hasFfmpeg = await checkFfmpeg();
    const formats = [];
    const seen = new Set();

    if (info.formats) {
      const compatibleFormats = info.formats
        .filter(f => (hasFfmpeg || (f.vcodec !== 'none' && f.acodec !== 'none')) && (f.ext === 'mp4' || f.ext === 'webm'))
        .sort((a, b) => (b.height || 0) - (a.height || 0));

      for (const f of compatibleFormats) {
        const label = f.height ? `${f.height}p` : 'video';
        if (!seen.has(label)) {
          seen.add(label);
          formats.push({ format_id: f.format_id, label, ext: f.ext, height: f.height });
        }
      }
    }

    if (!seen.has('best')) {
      formats.unshift({
        format_id: hasFfmpeg ? 'bestvideo+bestaudio/best' : 'best',
        label: 'Best Quality' + (!hasFfmpeg ? ' (Single Stream)' : ''),
        ext: 'mp4',
      });
    }

    formats.push({ format_id: 'bestaudio/best', label: 'Audio Only (MP3)', ext: 'mp3' });

    res.json({
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration,
      uploader: info.uploader,
      platform: detectPlatform(url),
      formats: formats.length > 0 ? formats : [
        { format_id: hasFfmpeg ? 'bestvideo+bestaudio/best' : 'best', label: 'Best Quality', ext: 'mp4' },
      ],
    });
  } catch (err) {
    console.error('Info error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch video info' });
  }
});

app.post('/api/download', async (req, res) => {
  const { url, format_id } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const hasFfmpeg = await checkFfmpeg();
  const isAudio = format_id && format_id.includes('bestaudio');
  const tempId = uuidv4();
  const tempPath = path.resolve(DOWNLOADS_DIR, `${tempId}.%(ext)s`);

  let actualFilePath = null;

  try {
    const options = {
      output: tempPath,
      noPlaylist: true,
      noWarnings: true,
      noPart: true, // Prevents using .part files which reduces lock issues
      addHeader: [
        'referer:https://www.google.com/',
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'accept-language:es-ES,es;q=0.9,en;q=0.8',
      ],
    };

    if (format_id === 'bestaudio/best') {
      options.extractAudio = true;
      options.audioFormat = 'mp3';
      options.format = 'bestaudio/best';
    } else if (format_id === 'bestvideo+bestaudio/best') {
      if (hasFfmpeg) {
        options.format = 'bestvideo+bestaudio/best';
        options.mergeOutputFormat = 'mp4';
      } else {
        options.format = 'best';
      }
    } else if (format_id) {
      options.format = format_id;
    } else {
      options.format = hasFfmpeg ? 'bestvideo+bestaudio/best' : 'best';
    }

    console.log(`Downloading: ${url} …`);
    try {
      await youtubeDl(url, options);
    } catch (dlErr) {
      console.warn('yt-dlp threw an error. Checking if file was still saved... Error:', dlErr.message.slice(0, 200));
      // WinError 32 usually means the file downloaded completely but locked during rename.
      // Wait 1 second for the process/antivirus to release the lock
      await new Promise(r => setTimeout(r, 1000));
    }

    const files = fs.readdirSync(DOWNLOADS_DIR);
    // Look for the completed file, fallback to the temp file if the rename actually failed and left the locked temp
    let actualFile = files.find(f => f.includes(tempId) && !f.endsWith('.part') && !f.endsWith('.ytdl'));
    if (!actualFile) throw new Error(`Download failed: could not find file with ID ${tempId} after waiting`);

    actualFilePath = path.resolve(DOWNLOADS_DIR, actualFile);
    console.log(`Uploading to Cloudinary: ${actualFilePath} …`);

    // In case the file is STILL locked (WinError 32), reading it for upload could throw.
    // Cloudinary might fail to read. We can retry logic later, but usually the 1s delay fixes it.
    const uploadResult = await cloudinary.uploader.upload(actualFilePath, {
      resource_type: isAudio ? 'auto' : 'video',
      folder: 'video_downloader',
      public_id: `video_${tempId}`,
    });

    if (!uploadResult?.secure_url) {
      throw new Error('La subida a la nube falló: no se recibió una URL válida.');
    }

    res.json({ success: true, url: uploadResult.secure_url, public_id: uploadResult.public_id });

    setTimeout(() => {
      try { if (fs.existsSync(actualFilePath)) fs.unlinkSync(actualFilePath); } catch (_) {}
    }, 10000);

  } catch (err) {
    console.error('Download/Upload error:', err.message);
    try {
      const files = fs.readdirSync(DOWNLOADS_DIR);
      files.filter(f => f.includes(tempId)).forEach(f => {
        try { fs.unlinkSync(path.resolve(DOWNLOADS_DIR, f)); } catch (_) {}
      });
    } catch (_) {}
    res.status(500).json({ error: err.message || 'Download/Upload failed' });
  }
});

/**
 * GET /api/lyrics?url=<video_url>
 *
 * Uses runYtDlp() (direct exec) instead of youtube-dl-exec wrapper so
 * we have full control over the binary and can read stdout/stderr.
 * Each request gets an isolated temp directory.
 *
 * Language strategy: try 'es' first (single lang = less chance of 429),
 * then 'en', then skip if both fail.
 */
app.get('/api/lyrics', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const requestId = uuidv4();
  const requestDir = path.resolve(DOWNLOADS_DIR, requestId);
  fs.mkdirSync(requestDir, { recursive: true });

  const cleanup = () => {
    try { fs.rmSync(requestDir, { recursive: true, force: true }); } catch (_) {}
  };

  // Find the best .vtt in the isolated dir
  const findVtt = () => {
    try {
      const files = fs.readdirSync(requestDir);
      console.log('[lyrics] Files in dir:', files);
      return files.find(f => f.endsWith('.vtt')) || null;
    } catch (_) { return null; }
  };

  let videoInfo = null;

  try {
    // Step 1: get metadata via youtube-dl-exec (it handles JSON parsing well)
    console.log(`[lyrics] Fetching metadata: ${url}`);
    videoInfo = await youtubeDl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noPlaylist: true,
      addHeader: [
        'referer:https://www.google.com/',
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'accept-language:es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7',
      ],
    });

    console.log(`[lyrics] Title: "${videoInfo.title}"`);
    console.log(`[lyrics] Manual subs available:`, Object.keys(videoInfo.subtitles || {}));
    console.log(`[lyrics] Auto captions available:`, Object.keys(videoInfo.automatic_captions || {}).slice(0, 20));

    // Step 2: try subtitle download — ONE language at a time to avoid 429
    // Try the languages that exist on the video first
    const allAvailable = [
      ...Object.keys(videoInfo.subtitles || {}),
      ...Object.keys(videoInfo.automatic_captions || {}),
    ];

    // Prioritize: es → en → first available → give up
    const prioritized = [];
    if (allAvailable.includes('es')) prioritized.push('es');
    if (allAvailable.includes('en')) prioritized.push('en');
    // Add any remaining language not already queued
    for (const lang of allAvailable) {
      if (!prioritized.includes(lang)) prioritized.push(lang);
    }
    // Fallback if metadata didn't list any (sometimes happens)
    if (prioritized.length === 0) prioritized.push('es', 'en');

    console.log(`[lyrics] Will try langs in order:`, prioritized.slice(0, 5));

    let lyricsText = null;

    for (const lang of prioritized.slice(0, 4)) { // max 4 attempts
      // Clean old vtts
      try {
        fs.readdirSync(requestDir)
          .filter(f => f.endsWith('.vtt'))
          .forEach(f => fs.unlinkSync(path.resolve(requestDir, f)));
      } catch (_) {}

      console.log(`[lyrics] Trying lang="${lang}" …`);

      // Use direct exec so we see real output and avoid wrapper quirks
      const { err, stdout, stderr } = await runYtDlp([
        '--skip-download',
        '--no-playlist',
        '--write-subs',
        '--write-auto-subs',
        '--sub-langs', lang,
        '--sub-format', 'vtt',
        '--no-warnings',
        '--add-header', 'referer:https://www.google.com/',
        '--add-header', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        '-o', path.resolve(requestDir, 'out.%(ext)s'),
        url,
      ], requestDir);

      const vttFile = findVtt();
      if (vttFile) {
        const raw = fs.readFileSync(path.resolve(requestDir, vttFile), 'utf8');
        const parsed = parseVtt(raw);
        console.log(`[lyrics] Got ${parsed.length} chars from "${vttFile}"`);
        if (parsed.trim().length > 20) {
          lyricsText = parsed;
          break;
        }
      } else {
        // Check if 429 in stderr — if so stop immediately
        if (stderr && (stderr.includes('429') || stderr.includes('Too Many Requests'))) {
          console.warn('[lyrics] 429 detected, stopping attempts');
          cleanup();
          return res.status(429).json({
            error: 'YouTube está limitando las peticiones (429). Espera 2–5 minutos e inténtalo de nuevo.',
          });
        }
      }
    }

    cleanup();

    if (!lyricsText) {
      const availableStr = Object.keys(videoInfo.subtitles || {}).join(', ') ||
                           Object.keys(videoInfo.automatic_captions || {}).slice(0, 5).join(', ') ||
                           'ninguno detectado';
      return res.json({
        success: false,
        title: videoInfo.title,
        thumbnail: videoInfo.thumbnail,
        lyrics: null,
        message:
          `No se pudieron descargar los subtítulos para "${videoInfo.title}". ` +
          `Idiomas detectados: ${availableStr}. ` +
          `Intenta de nuevo en unos segundos.`,
      });
    }

    return res.json({
      success: true,
      title: videoInfo.title,
      thumbnail: videoInfo.thumbnail,
      lyrics: lyricsText,
    });

  } catch (err) {
    cleanup();
    const errorMsg = err.message || String(err);
    console.error('[lyrics] Fatal:', errorMsg.slice(0, 400));

    if (errorMsg.includes('429') || errorMsg.includes('Too Many Requests')) {
      return res.status(429).json({
        error: 'YouTube está limitando las peticiones (429). Espera unos minutos e inténtalo de nuevo.',
      });
    }

    res.status(500).json({ error: errorMsg || 'No se pudo obtener la letra.' });
  }
});

app.delete('/api/video/:public_id', async (req, res) => {
  const { public_id } = req.params;
  try {
    const result = await cloudinary.uploader.destroy(public_id, { resource_type: 'video' });
    
    // Also delete any remaining local files
    try {
      const tempId = public_id.replace('video_', '');
      const files = fs.readdirSync(DOWNLOADS_DIR);
      files.filter(f => f.includes(tempId)).forEach(f => {
         try { fs.unlinkSync(path.resolve(DOWNLOADS_DIR, f)); } catch (_) {}
      });
    } catch (e) {
      console.warn('Error deleting local file during video delete:', e.message);
    }
    
    res.json({ success: true, result });
  } catch (err) {
    console.error('Cloudinary delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/video/bulk-delete', async (req, res) => {
  const { publicIds } = req.body;
  if (!publicIds || !publicIds.length) return res.status(400).json({ error: 'No publicIds provided' });

  const results = await Promise.allSettled(
    publicIds.map(id => cloudinary.uploader.destroy(id, { resource_type: 'video' }))
  );

  // Clean local files for all bulk-deleted items
  try {
    const files = fs.readdirSync(DOWNLOADS_DIR);
    publicIds.forEach(public_id => {
      const tempId = public_id.replace('video_', '');
      files.filter(f => f.includes(tempId)).forEach(f => {
         try { fs.unlinkSync(path.resolve(DOWNLOADS_DIR, f)); } catch (_) {}
      });
    });
  } catch (e) {
    console.warn('Error deleting local files during bulk-delete:', e.message);
  }

  res.json({ success: true, results });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});