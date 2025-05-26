const { Markup } = require('telegraf');
const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const FormData = require('form-data');
const { Scenes } = require('telegraf');
const { BaseScene } = Scenes;

const execPromise = util.promisify(exec);

// Constants
const MAX_FILE_SIZE_MB = 50; // Max file size for Telegram (MB)
const UPLOAD_TIMEOUT_MS = 60000; // Upload timeout to tmpfiles.org
const PROGRESS_UPDATE_INTERVAL_MS = 3000; // Progress bar update interval
const UPLOAD_SIMULATION_DURATION_MS = 30000; // Simulated upload duration
const VALID_QUALITIES = ['360p', '480p', '720p', '1080p'];
const YOUTUBE_URL_REGEX = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
const TEMP_FILE_CLEANUP_DELAY_MS = 5000; // Delay for file write completion
const MESSAGE_DELETE_DELAY = 600000; // 10 minutes (sync with index.js)

// Language support (aligned with index.js)
const i18n = {
  fa: {
    youtube_url_prompt: '🔗 لینک ویدیو یوتیوب را وارد کنید\\:',
    invalid_url: '❌ لطفاً یک لینک معتبر یوتیوب وارد کنید (مثل https://youtu\\.be/...)\\.',
    choose_quality: '📽️ کیفیت ویدیو را انتخاب کنید\\:',
    invalid_quality: '❌ لطفاً یکی از کیفیت‌های 360p، 480p، 720p یا 1080p را انتخاب کنید\\.',
    downloading: '⏳ در حال دانلود ویدیو...\\.',
    download_success: '✅ ویدیو دانلود و ذخیره شد\\!\nمی‌خواهید در تلگرام ارسال شود یا در پوشه بماند\\?',
    uploading: '⏳ در حال ارسال ویدیو... %d%%',
    upload_success: '✅ ویدیو با موفقیت ارسال شد\\!',
    file_too_large: '❌ فایل (%s مگابایت) برای تلگرام خیلی بزرگ است\\.\nلینک دانلود (2 ساعت اعتبار): %s',
    saved_in_folder: '📁 ویدیو در پوشه ذخیره شد\\.',
    invalid_action: '❌ لطفاً یکی از گزینه‌ها را انتخاب کنید\\.',
    error_generic: '❌ خطا: %s\\.',
    cancel: 'لغو',
    cancelled: '❌ عملیات لغو شد\\.'
  },
  en: {
    youtube_url_prompt: '🔗 Enter the YouTube video link\\:',
    invalid_url: '❌ Please enter a valid YouTube link (e.g., https://youtu\\.be/...)\\.',
    choose_quality: '📽️ Select video quality\\:',
    invalid_quality: '❌ Please select one of 360p, 480p, 720p, or 1080p\\.',
    downloading: '⏳ Downloading video...\\.',
    download_success: '✅ Video downloaded and saved\\!\nDo you want to send it on Telegram or keep it in the folder\\?',
    uploading: '⏳ Uploading video... %d%%',
    upload_success: '✅ Video sent successfully\\!',
    file_too_large: '❌ File (%s MB) is too large for Telegram\\.\nDownload link (valid for 2 hours): %s',
    saved_in_folder: '📁 Video saved in folder\\.',
    invalid_action: '❌ Please select one of the options\\.',
    error_generic: '❌ Error: %s\\.',
    cancel: 'Cancel',
    cancelled: '❌ Operation cancelled\\.'
  }
};

// Delay helper
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Escape MarkdownV2 (from index.js)
const escapeMarkdownV2 = (text) => {
  if (!text) return '';
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
};

// Ensure user directory
const ensureUserDir = async (chatId) => {
  const dir = path.join(__dirname, 'Uploads', String(chatId));
  try {
    await fs.mkdir(dir, { recursive: true });
    console.log(`[YouTube] Created directory: ${dir}`);
    return dir;
  } catch (err) {
    console.error(`[YouTube] Error creating directory ${dir}: ${err.message}`);
    throw new Error(`Directory creation failed: ${err.message}`);
  }
};

// Upload file to tmpfiles.org
const uploadToTmpFiles = async (filePath) => {
  try {
    const form = new FormData();
    form.append('file', require('fs').createReadStream(filePath));
    const response = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
      headers: form.getHeaders(),
      timeout: UPLOAD_TIMEOUT_MS,
    });
    if (response.data?.data?.url) {
      return response.data.data.url;
    }
    throw new Error('No download link received from tmpfiles.org.');
  } catch (err) {
    console.error(`[YouTube] Error uploading to tmpfiles.org: ${err.message}`);
    throw new Error(`Upload to tmpfiles.org failed: ${err.message}`);
  }
};

// Clean up temporary files
const cleanupTempFiles = async (userDir, fileBaseName) => {
  try {
    const files = await fs.readdir(userDir);
    const tempFiles = files.filter(
      (file) => file.startsWith(fileBaseName) && (file.includes('.part') || file.includes('.f'))
    );
    for (const file of tempFiles) {
      await fs.unlink(path.join(userDir, file));
      console.log(`[YouTube] Deleted temporary file: ${file}`);
    }
  } catch (err) {
    console.error(`[YouTube] Error cleaning up temp files: ${err.message}`);
  }
};

// Reply and delete message (from index.js, simplified for youtube.js)
const messageQueue = [];
const replyAndDelete = async (ctx, method, content, options = {}, delayMs = MESSAGE_DELETE_DELAY) => {
  try {
    const lang = ctx.session.lang || 'fa';
    let sentMessage;
    try {
      sentMessage = await ctx[method](content, { parse_mode: 'MarkdownV2', ...options });
    } catch (err) {
      if (err.error_code === 400 && err.description.includes("can't parse entities")) {
        console.warn(`[YouTube] MarkdownV2 parse error: ${err.description}, falling back to plain text`);
        sentMessage = await ctx[method](content.replace(/\\([_*[\]()~`>#+\-=|{}.!\\])/g, '$1'), { ...options, parse_mode: undefined });
      } else {
        throw err;
      }
    }
    messageQueue.push({ chatId: ctx.chat.id, messageId: sentMessage.message_id, timestamp: Date.now(), delay: delayMs });
    return sentMessage;
  } catch (err) {
    console.error(`[YouTube] Error sending message: ${err.message}`);
    try {
      await ctx.reply(i18n[ctx.session.lang || 'fa'].error_generic.replace(/\\([_*[\]()~`>#+\-=|{}.!\\])/g, '$1'));
    } catch (fallbackErr) {
      console.error(`[YouTube] Error sending fallback message: ${fallbackErr.message}`);
    }
    throw err;
  }
};

// Process message queue for deletion
setInterval(async () => {
  const now = Date.now();
  for (let i = messageQueue.length - 1; i >= 0; i--) {
    const { chatId, messageId, delay, timestamp } = messageQueue[i];
    if (now - timestamp >= delay) {
      try {
        await bot.telegram.deleteMessage(chatId, messageId);
        messageQueue.splice(i, 1);
      } catch (err) {
        console.error(`[YouTube] Error deleting message ${messageId}: ${err.message}`);
      }
    }
  }
}, 1000);

// YouTube download scene
let bot; // Will be set in registerYouTube
const downloadYouTubeScene = new BaseScene('DOWNLOAD_YOUTUBE_SCENE');

downloadYouTubeScene.enter(async (ctx) => {
  console.log(`[YouTube] User ${ctx.chat.id} entered DOWNLOAD_YOUTUBE_SCENE`);
  ctx.session.downloadYouTube = { step: 'url' };
  const lang = ctx.session.lang || 'fa';
  try {
    await replyAndDelete(ctx, 'reply', i18n[lang].youtube_url_prompt, {
      ...Markup.keyboard([[i18n[lang].cancel]]).oneTime().resize()
    });
  } catch (err) {
    console.error(`[YouTube] Error sending enter message: ${err.message}`);
    await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
  }
});

downloadYouTubeScene.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  console.log(`[YouTube] User ${ctx.chat.id} sent: ${text}`);
  const lang = ctx.session.lang || 'fa';
  const dy = ctx.session.downloadYouTube;

  if (text === i18n[lang].cancel) {
    delete ctx.session.downloadYouTube;
    await replyAndDelete(ctx, 'reply', i18n[lang].cancelled, { ...Markup.removeKeyboard() });
    return ctx.scene.leave();
  }

  if (dy?.step === 'url') {
    if (!YOUTUBE_URL_REGEX.test(text)) {
      console.log(`[YouTube] Invalid YouTube URL: ${text}`);
      await replyAndDelete(ctx, 'reply', i18n[lang].invalid_url);
      return;
    }
    dy.step = 'choose_quality';
    dy.url = text;
    await replyAndDelete(ctx, 'reply', i18n[lang].choose_quality, {
      ...Markup.keyboard([['360p', '480p'], ['720p', '1080p'], [i18n[lang].cancel]]).oneTime().resize()
    });
  } else if (dy?.step === 'choose_quality') {
    if (!VALID_QUALITIES.includes(text)) {
      await replyAndDelete(ctx, 'reply', i18n[lang].invalid_quality);
      return;
    }

    const quality = text;
    const { url } = dy;
    let conn;

    try {
      console.log(`[YouTube] Downloading video from ${url} with quality ${quality}`);
      conn = await pool.getConnection();
      const userDir = await ensureUserDir(ctx.chat.id);
      const fileBaseName = `YouTube_${Date.now()}`;
      const filePathMp4 = path.join(userDir, `${fileBaseName}.mp4`);
      const filePathWebm = path.join(userDir, `${fileBaseName}.webm`);

      const { ffmpegPath, ytdlpPath } = ctx.session.binaries || {};
      if (!ffmpegPath || !ytdlpPath) {
        throw new Error(i18n[lang].error_generic.replace('%s', 'ffmpeg or yt-dlp not available'));
      }

      const qualityMap = {
        '360p': 'bestvideo[height<=360]+bestaudio/best[height<=360]',
        '480p': 'bestvideo[height<=480]+bestaudio/best[height<=480]',
        '720p': 'bestvideo[height<=720]+bestaudio/best[height<=720]',
        '1080p': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
      };
      const format = qualityMap[quality];

      await replyAndDelete(ctx, 'reply', i18n[lang].downloading);

      const command = `"${ytdlpPath}" -f "${format}" -o "${filePathMp4}" --ffmpeg-location "${ffmpegPath}" --no-part "${url}"`;
      console.log(`[YouTube] Executing command: ${command}`);

      const { stdout, stderr } = await execPromise(command);
      console.log(`[YouTube] yt-dlp stdout: ${stdout}`);
      if (stderr) console.warn(`[YouTube] yt-dlp stderr: ${stderr}`);

      await delay(TEMP_FILE_CLEANUP_DELAY_MS);

      let finalFilePath = filePathMp4;
      if (await fs.access(filePathMp4).then(() => true).catch(() => false)) {
        console.log(`[YouTube] Found output file: ${filePathMp4}`);
      } else if (await fs.access(filePathWebm).then(() => true).catch(() => false)) {
        console.log(`[YouTube] Found output file: ${filePathWebm}`);
        finalFilePath = filePathWebm;
      } else {
        const filesInDir = (await fs.readdir(userDir)).filter(
          (file) => file.startsWith(fileBaseName) && (file.endsWith('.mp4') || file.endsWith('.webm'))
        );
        if (filesInDir.length > 0) {
          finalFilePath = path.join(userDir, filesInDir[0]);
          console.log(`[YouTube] Using matching file: ${finalFilePath}`);
        } else {
          throw new Error('Video file not downloaded: no file found.');
        }
      }

      await cleanupTempFiles(userDir, fileBaseName);

      const [folderResult] = await conn.execute(
        'INSERT INTO folders (chat_id, folder_name) VALUES (?, ?)',
        [ctx.chat.id, `YouTube_${Date.now()}`]
      );
      const folderId = folderResult.insertId;

      await conn.execute(
        'INSERT INTO folder_files (folder_id, file_path, file_type) VALUES (?, ?, ?)',
        [folderId, finalFilePath, 'video']
      );

      dy.step = 'choose_action';
      dy.finalFilePath = finalFilePath;
      dy.folderId = folderId;

      await replyAndDelete(ctx, 'reply', i18n[lang].download_success, {
        ...Markup.keyboard([
          [i18n[lang].send_to_telegram || '📤 Send to Telegram', i18n[lang].save_in_folder || '📁 Save in folder'],
          [i18n[lang].cancel]
        ]).oneTime().resize()
      });
      console.log(`[YouTube] Asked user ${ctx.chat.id} to choose action for file: ${finalFilePath}`);
    } catch (err) {
      console.error(`[YouTube] Error in DOWNLOAD_YOUTUBE_SCENE: ${err.message}`);
      await replyAndDelete(ctx, 'reply', i18n[lang].error_generic.replace('%s', escapeMarkdownV2(err.message)));
      delete ctx.session.downloadYouTube;
      return ctx.scene.leave();
    } finally {
      if (conn && dy.step !== 'choose_action') conn.release();
    }
  } else if (dy?.step === 'choose_action') {
    const action = text;
    const { finalFilePath, folderId } = dy;
    let conn;

    try {
      conn = await pool.getConnection();

      if (action === (i18n[lang].send_to_telegram || '📤 Send to Telegram')) {
        const stats = await fs.stat(finalFilePath);
        const fileSizeMB = stats.size / (1024 * 1024);

        if (fileSizeMB > MAX_FILE_SIZE_MB) {
          const downloadLink = await uploadToTmpFiles(finalFilePath);
          const sizeStr = fileSizeMB.toFixed(2);
          await replyAndDelete(ctx, 'reply', i18n[lang].file_too_large.replace('%s', escapeMarkdownV2(sizeStr)).replace('%s', escapeMarkdownV2(downloadLink)), {
            ...Markup.removeKeyboard()
          });
          console.log(`[YouTube] Generated download link for user ${ctx.chat.id}: ${downloadLink}`);
        } else {
          const statusMessage = await replyAndDelete(ctx, 'reply', i18n[lang].uploading.replace('%d', 0));
          const messageId = statusMessage.message_id;

          let progress = 0;
          const interval = setInterval(async () => {
            progress += 10;
            if (progress <= 100) {
              try {
                await bot.telegram.editMessageText(
                  ctx.chat.id,
                  messageId,
                  undefined,
                  i18n[lang].uploading.replace('%d', progress),
                  { parse_mode: 'MarkdownV2' }
                );
              } catch (err) {
                console.warn(`[YouTube] Error updating progress: ${err.message}`);
                try {
                  await bot.telegram.editMessageText(
                    ctx.chat.id,
                    messageId,
                    undefined,
                    i18n[lang].uploading.replace('%d', progress).replace(/\\([_*[\]()~`>#+\-=|{}.!\\])/g, '$1')
                  );
                } catch (editErr) {
                  console.error(`[YouTube] Error updating progress fallback: ${editErr.message}`);
                }
              }
            }
          }, PROGRESS_UPDATE_INTERVAL_MS);

          try {
            await ctx.replyWithVideo(
              { source: require('fs').createReadStream(finalFilePath) },
              { caption: escapeMarkdownV2(i18n[lang].video_caption || '🎥 Your video!') }
            );
            clearInterval(interval);
            await bot.telegram.editMessageText(
              ctx.chat.id,
              messageId,
              undefined,
              i18n[lang].upload_success,
              { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() }
            );
            console.log(`[YouTube] Sent video to user ${ctx.chat.id}: ${finalFilePath}`);
          } catch (err) {
            clearInterval(interval);
            throw new Error(`Video upload failed: ${err.message}`);
          }
        }
      } else if (action === (i18n[lang].save_in_folder || '📁 Save in folder')) {
        await replyAndDelete(ctx, 'reply', i18n[lang].saved_in_folder, { ...Markup.removeKeyboard() });
        console.log(`[YouTube] Kept video in folder for user ${ctx.chat.id}: ${finalFilePath}`);
      } else {
        await replyAndDelete(ctx, 'reply', i18n[lang].invalid_action);
        return;
      }

      delete ctx.session.downloadYouTube;
      return ctx.scene.leave();
    } catch (err) {
      console.error(`[YouTube] Error in choose_action: ${err.message}`);
      await replyAndDelete(ctx, 'reply', i18n[lang].error_generic.replace('%s', escapeMarkdownV2(err.message)), { ...Markup.removeKeyboard() });
      return ctx.scene.leave();
    } finally {
      if (conn) conn.release();
    }
  } else {
    console.log(`[YouTube] Invalid step for user ${ctx.chat.id}`);
    await replyAndDelete(ctx, 'reply', i18n[lang].invalid_url);
  }
});

// Register YouTube feature
const registerYouTube = async (botInstance, stage, poolInstance) => {
  try {
    bot = botInstance; // Set bot instance for scene
    stage.register(downloadYouTubeScene);

    bot.command('DownloadYouTube', async (ctx) => {
      console.log(`[YouTube] User ${ctx.chat.id} triggered /DownloadYouTube`);
      return ctx.scene.enter('DOWNLOAD_YOUTUBE_SCENE');
    });
  } catch (err) {
    console.error('[YouTube] Error registering YouTube feature:', err.message);
    throw new Error(`Failed to register YouTube feature: ${err.message}`);
  }
};

module.exports = { registerYouTube };