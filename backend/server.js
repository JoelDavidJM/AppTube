const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const youtubeDl = require('youtube-dl-exec');
const { v4: uuidv4 } = require('uuid');

const cloudinary = require('cloudinary').v2;

// Cloudinary Configuration
cloudinary.config({
  cloud_name: 'dwi1xpx9h',
  api_key: '534381816734129',
  api_secret: '59nE43-Fw6ohqnnmSkMIJFqK5L0'
});

const app = express();
const PORT = 3001;

// Ensure downloads directory exists for temp storage
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
}));
app.use(express.json());
app.use('/downloads', express.static(DOWNLOADS_DIR));

// Function to check if ffmpeg is available
function checkFfmpeg() {
  return new Promise((resolve) => {
    exec('ffmpeg -version', (err) => {
      resolve(!err);
    });
  });
}

/**
 * Detect platform from URL
 */
function detectPlatform(url) {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/tiktok\.com/i.test(url)) return 'tiktok';
  return 'other';
}

/**
 * GET /api/info?url=<video_url>
 */
app.get('/api/info', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const info = await youtubeDl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noPlaylist: true,
      addHeader: [
        'referer:youtube.com',
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
      ]
    });

    const hasFfmpeg = await checkFfmpeg();

    // Build available quality options
    const formats = [];
    const seen = new Set();

    if (info.formats) {
      // If no ffmpeg, we ONLY want combined formats (acodec != none and vcodec != none)
      const compatibleFormats = info.formats
        .filter(f => (hasFfmpeg || (f.vcodec !== 'none' && f.acodec !== 'none')) && (f.ext === 'mp4' || f.ext === 'webm'))
        .sort((a, b) => (b.height || 0) - (a.height || 0));

      for (const f of compatibleFormats) {
        const label = f.height ? `${f.height}p` : 'video';
        if (!seen.has(label)) {
          seen.add(label);
          formats.push({
            format_id: f.format_id,
            label,
            ext: f.ext,
            height: f.height,
          });
        }
      }
    }

    // Default "Best" option
    if (!seen.has('best')) {
      // Use combined format if no ffmpeg
      formats.unshift({ 
        format_id: hasFfmpeg ? 'bestvideo+bestaudio/best' : 'best', 
        label: 'Best Quality' + (!hasFfmpeg ? ' (Single Stream)' : ''), 
        ext: 'mp4' 
      });
    }

    // Add audio-only option
    formats.push({ format_id: 'bestaudio/best', label: 'Audio Only (MP3)', ext: 'mp3' });

    res.json({
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration,
      uploader: info.uploader,
      platform: detectPlatform(url),
      formats: formats.length > 0 ? formats : [
        { format_id: hasFfmpeg ? 'bestvideo+bestaudio/best' : 'best', label: 'Best Quality', ext: 'mp4' }
      ]
    });
  } catch (err) {
    console.error('Info error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch video info' });
  }
});

/**
 * POST /api/download
 */
app.post('/api/download', async (req, res) => {
  const { url, format_id, label } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const hasFfmpeg = await checkFfmpeg();
  const isAudio = format_id && format_id.includes('bestaudio');
  const tempId = uuidv4();
  const ext = isAudio ? 'mp3' : 'mp4';
  const tempPath = path.resolve(DOWNLOADS_DIR, `${tempId}.%(ext)s`); // yt-dlp pattern

  try {
    const options = {
      output: tempPath,
      noPlaylist: true,
      noWarnings: true,
      addHeader: [
        'referer:youtube.com',
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
      ]
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
          options.format = 'best'; // Fallback to combined best (usually 720p)
       }
    } else if (format_id) {
       options.format = format_id;
    } else {
       options.format = hasFfmpeg ? 'bestvideo+bestaudio/best' : 'best';
    }

    console.log(`Downloading locally: ${url} (hasFfmpeg: ${hasFfmpeg}) ...`);
    await youtubeDl(url, options);

    // Find actual output file precisely
    const files = fs.readdirSync(DOWNLOADS_DIR);
    const actualFile = files.find(f => f.includes(tempId));
    
    if (!actualFile) {
      console.error(`Files in dir: ${files.join(', ')}`);
      throw new Error(`Download failed: could not find file with ID ${tempId}`);
    }
    
    const actualFilePath = path.resolve(DOWNLOADS_DIR, actualFile);

    console.log(`Uploading to Cloudinary: ${actualFilePath} ...`);
    const uploadResult = await cloudinary.uploader.upload(actualFilePath, {
      resource_type: isAudio ? 'auto' : 'video', 
      folder: 'video_downloader',
      public_id: `video_${tempId}`,
    });

    if (!uploadResult || !uploadResult.secure_url) {
       console.error('CRITICAL: Cloudinary did not return a secure_url. Full response:', JSON.stringify(uploadResult));
       throw new Error('La subida a la nube falló: no se recibió una URL válida.');
    }

    console.log(`Upload success! Public ID: ${uploadResult.public_id}, URL: ${uploadResult.secure_url}`);

    res.json({
      success: true,
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id
    });

    // Cleanup local file after a short delay
    setTimeout(() => {
      try {
        if (fs.existsSync(actualFilePath)) {
          fs.unlinkSync(actualFilePath);
          console.log(`Safely cleaned up: ${actualFile}`);
        }
      } catch (err) {}
    }, 10000); // 10 second buffer to be extra safe during stream closure

  } catch (err) {
    console.error('Download/Upload error:', err.message);
    
    // Attempt cleanup
    try {
      const files = fs.readdirSync(DOWNLOADS_DIR);
      const actualFile = files.find(f => f.includes(tempId));
      if (actualFile) {
        fs.unlinkSync(path.resolve(DOWNLOADS_DIR, actualFile));
      }
    } catch (cleanupErr) {}

    res.status(500).json({ error: err.message || 'Download/Upload failed' });
  }
});

/**
 * DELETE /api/video/:public_id
 */
app.delete('/api/video/:public_id', async (req, res) => {
  const { public_id } = req.params;
  try {
     const result = await cloudinary.uploader.destroy(public_id, { resource_type: 'video' });
     console.log(`Cloudinary delete result for ${public_id}:`, result);
     res.json({ success: true, result });
  } catch (err) {
     console.error('Cloudinary delete error:', err.message);
     res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Video Downloader API running on http://localhost:${PORT}`);
});
