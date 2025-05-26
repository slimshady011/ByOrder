require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const bcrypt = require('bcrypt');
const stream = require('stream');
const util = require('util');
const pool = require('./db');
const { registerYouTube } = require('./youtube');
const { setupBinaries } = require('./utils');

// Constants
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const SALT_ROUNDS = 10; // bcrypt salt rounds
const MAX_TEXT_LENGTH = 4000; // Max text length
const MESSAGE_DELETE_DELAY = 600000; // 10 minutes
const PAGE_SIZE = 10; // Number of folders per page

// Language support
const i18n = {
  fa: {
    welcome: 'سلام 👋\nبه ربات مدیریت پوشه‌ها خوش آمدید\\!',
    commands: '/CrFolders → ساخت پوشه جدید\n/OpenFolder → باز کردن پوشه\n/ListFolders → لیست پوشه‌ها\n/SearchFolders → جستجوی پوشه‌ها\n/EditFolder → ویرایش پوشه\n/DeleteFile → حذف فایل از پوشه\n/DownloadYouTube → دانلود ویدیو از یوتیوب',
    folder_name_prompt: '📁 نام پوشه را وارد کنید\\:',
    cancel: 'لغو',
    error_folder_exists: '⚠️ این نام قبلاً استفاده شده است\\.',
    invalid_folder_name: '⚠️ نام پوشه فقط می‌تواند شامل حروف، اعداد، خط زیر (_) و فاصله باشد\\.',
    file_upload_prompt: '📤 فایل‌ها یا متن را ارسال کنید\\. پایان: "ارسال تکمیل شد\\."',
    complete_upload: 'ارسال تکمیل شد\\.',
    description_prompt: '✏️ توضیحات (اختیاری)\\:',
    skip: 'نه، ممنون',
    tags_prompt: '🏷️ تگ‌ها (اختیاری)\\:',
    password_prompt: '🔒 آیا می‌خواهید برای پوشه رمز عبور تنظیم کنید\\?',
    yes: 'بله',
    no: 'خیر',
    set_password_prompt: '🔑 رمز عبور را وارد کنید (حداقل 4 کاراکتر)\\:',
    invalid_password: '⚠️ رمز عبور باید حداقل 4 کاراکتر باشد\\.',
    cover_prompt: '🖼️ عکس کاور (اختیاری)\\:',
    folder_saved: '✅ پوشه ذخیره شد\\.',
    folder_not_found: '⚠️ پوشه یافت نشد\\.',
    password_required: '🔑 رمز عبور پوشه را وارد کنید\\:',
    wrong_password: '⚠️ رمز عبور اشتباه است\\.',
    no_folders: '⚠️ هیچ پوشه‌ای یافت نشد\\.',
    search_prompt: '🔍 عبارت جستجو را وارد کنید\\:',
    no_results: '⚠️ هیچ پوشه‌ای یافت نشد\\.',
    folder_deleted: '✅ پوشه حذف شد\\.',
    error_generic: '❌ مشکلی پیش آمد\\. لطفاً دوباره امتحان کنید\\.',
    back: 'بازگشت',
    help: 'راهنما',
    select_file_to_delete: '📂 فایل مورد نظر برای حذف را انتخاب کنید\\:',
    file_deleted: '✅ فایل حذف شد\\.',
    files_added: '✅ فایل‌ها اضافه شدند\\.',
    no_files_uploaded: '⚠️ هیچ فایلی آپلود نشده است\\.',
    file_received: '✅ فایل دریافت شد\\.',
    text_received: '✅ متن دریافت شد\\.',
    text_too_long: '⚠️ متن بیش از حد طولانی است\\.',
    cover_too_large: '⚠️ اندازه عکس کاور بیش از حد مجاز است\\.',
    file_too_large: '⚠️ اندازه فایل بیش از حد مجاز است\\.',
    animated_sticker_not_supported: '⚠️ استیکر متحرک پشتیبانی نمی‌شود\\.',
    try_other_commands: '🔄 دستورات دیگر را امتحان کنید\\.',
    folder_list: 'لیست پوشه‌ها',
    search_results: 'نتایج جستجو',
    details: 'جزئیات',
    add: 'اضافه کردن فایل',
    share: 'اشتراک‌گذاری',
    delete: 'حذف',
    edit: 'ویرایش',
    delete_file: 'حذف فایل',
    no_files: '⚠️ هیچ فایلی در این پوشه نیست\\.'
  },
  en: {
    welcome: 'Hello 👋\nWelcome to the Folder Management Bot\\!',
    commands: '/CrFolders → Create a new folder\n/OpenFolder → Open a folder\n/ListFolders → List folders\n/SearchFolders → Search folders\n/EditFolder → Edit a folder\n/DeleteFile → Delete a file from folder\n/DownloadYouTube → Download YouTube video',
    folder_name_prompt: '📁 Enter folder name\\:',
    cancel: 'Cancel',
    error_folder_exists: '⚠️ This folder name is already used\\.',
    invalid_folder_name: '⚠️ Folder name can only contain letters, numbers, underscore (_), and spaces\\.',
    file_upload_prompt: '📤 Send files or text\\. Finish: "Upload completed\\."',
    complete_upload: 'Upload completed\\.',
    description_prompt: '✏️ Description (optional)\\:',
    skip: 'No, thanks',
    tags_prompt: '🏷️ Tags (optional)\\:',
    password_prompt: '🔒 Do you want to set a password for the folder\\?',
    yes: 'Yes',
    no: 'No',
    set_password_prompt: '🔑 Enter folder password (minimum 4 characters)\\:',
    invalid_password: '⚠️ Password must be at least 4 characters\\.',
    cover_prompt: '🖼️ Cover image (optional)\\:',
    folder_saved: '✅ Folder saved\\.',
    folder_not_found: '⚠️ Folder not found\\.',
    password_required: '🔑 Enter folder password\\:',
    wrong_password: '⚠️ Incorrect password\\.',
    no_folders: '⚠️ No folders found\\.',
    search_prompt: '🔍 Enter search query\\:',
    no_results: '⚠️ No folders found\\.',
    folder_deleted: '✅ Folder deleted\\.',
    error_generic: '❌ Something went wrong\\. Please try again\\.',
    back: 'Back',
    help: 'Help',
    select_file_to_delete: '📂 Select a file to delete\\:',
    file_deleted: '✅ File deleted\\.',
    files_added: '✅ Files added\\.',
    no_files_uploaded: '⚠️ No files uploaded\\.',
    file_received: '✅ File received\\.',
    text_received: '✅ Text received\\.',
    text_too_long: '⚠️ Text is too long\\.',
    cover_too_large: '⚠️ Cover image size exceeds limit\\.',
    file_too_large: '⚠️ File size exceeds limit\\.',
    animated_sticker_not_supported: '⚠️ Animated stickers are not supported\\.',
    try_other_commands: '🔄 Try other commands\\.',
    folder_list: 'Folder list',
    search_results: 'Search results',
    details: 'Details',
    add: 'Add files',
    share: 'Share',
    delete: 'Delete',
    edit: 'Edit',
    delete_file: 'Delete file',
    no_files: '⚠️ No files in this folder\\.'
  }
};

// Bot setup
const bot = new Telegraf(process.env.BOT_TOKEN);
const { BaseScene, Stage } = Scenes;

// Validate BOT_TOKEN
if (!process.env.BOT_TOKEN) {
  console.error('Error: BOT_TOKEN not set in .env file.');
  process.exit(1);
}

// Test Telegram connection
bot.telegram.getMe()
  .then(botInfo => console.log(`Bot connected: @${botInfo.username}`))
  .catch(err => {
    console.error('Error connecting to Telegram:', err.message);
    process.exit(1);
  });

// Utility functions
/**
 * Escapes special characters for MarkdownV2
 * @param {string} text - Input text
 * @returns {string} Escaped text
 */
const escapeMarkdownV2 = (text) => {
  if (!text) return '';
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
};

/**
 * Sanitizes input to prevent SQL injection and malicious characters
 * @param {string} input - User input
 * @returns {string} Sanitized input
 */
const sanitizeInput = (input) => {
  if (!input) return '';
  return input.replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, '').slice(0, 255);
};

/**
 * Ensures user directory exists
 * @param {number} chatId - Telegram chat ID
 * @returns {string} Directory path
 */
const ensureUserDir = (chatId) => {
  const dir = path.join(__dirname, 'Uploads', String(chatId));
  if (!require('fs').existsSync(dir)) {
    require('fs').mkdirSync(dir, { recursive: true });
  }
  return dir;
};

/**
 * Restricts file paths to prevent Directory Traversal
 * @param {string} basePath - Base directory
 * @param {string} fileName - File name
 * @returns {string} Safe file path
 */
const restrictPath = (basePath, fileName) => {
  const resolvedPath = path.resolve(basePath, path.basename(fileName));
  if (!resolvedPath.startsWith(path.resolve(basePath))) {
    throw new Error('Invalid file path detected.');
  }
  return resolvedPath;
};

/**
 * Downloads a file from Telegram
 * @param {string} fileId - Telegram file ID
 * @param {string} destBase - Destination base path
 * @param {string} fileType - File type
 * @returns {Promise<string>} File path
 */
const pipelineAsync = util.promisify(stream.pipeline);
const downloadFile = async (fileId, destBase, fileType) => {
  try {
    const file = await bot.telegram.getFile(fileId);
    if (file.file_size > MAX_FILE_SIZE) {
      throw new Error('File size exceeds 20MB.');
    }
    const ext = getFileExtension(file, fileType);
    const destPath = restrictPath(destBase, `${Date.now()}${ext}`);
    const fileLink = await bot.telegram.getFileLink(fileId);
    const response = await axios.get(fileLink.href, { responseType: 'stream' });
    const writer = require('fs').createWriteStream(destPath);
    await pipelineAsync(response.data, writer);
    return destPath;
  } catch (err) {
    throw new Error(`Failed to download file: ${err.message}`);
  }
};

/**
 * Gets file extension based on mime type or file type
 * @param {object} file - Telegram file object
 * @param {string} fileType - File type
 * @returns {string} File extension
 */
const getFileExtension = (file, fileType) => {
  if (file.mime_type) {
    switch (file.mime_type) {
      case 'image/jpeg': return '.jpg';
      case 'image/png': return '.png';
      case 'video/mp4': return '.mp4';
      case 'audio/mpeg': return '.mp3';
      case 'audio/ogg': return '.ogg';
      case 'image/gif': return '.gif';
      default: break;
    }
  }
  switch (fileType) {
    case 'animation': return '.mp4';
    case 'video': return '.mp4';
    case 'photo': return '.jpg';
    case 'audio': return '.mp3';
    case 'voice': return '.ogg';
    case 'sticker': return '.webp';
    default: return '.bin';
  }
};

/**
 * Validates folder name
 * @param {string} name - Folder name
 * @returns {boolean} Validity
 */
const isValidFolderName = (name) => name.length <= 255 && /^[a-zA-Z0-9_\-\u0600-\u06FF\s]+$/.test(name);

/**
 * Validates password
 * @param {string} password - Password
 * @returns {boolean} Validity
 */
const isValidPassword = (password) => password.length >= 4;

/**
 * Validates text length
 * @param {string} text - Text
 * @returns {boolean} Validity
 */
const isValidText = (text) => text.length <= MAX_TEXT_LENGTH;

/**
 * Restricts access to folder based on chat ID
 * @param {object} ctx - Telegraf context
 * @param {number} folderId - Folder ID
 * @returns {Promise<object>} Folder data
 */
const restrictAccess = async (ctx, folderId) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.execute('SELECT * FROM folders WHERE id = ? AND chat_id = ?', [folderId, ctx.chat.id]);
    if (!rows.length) throw new Error('Folder not found or access denied.');
    return rows[0];
  } finally {
    if (conn) conn.release();
  }
};

/**
 * Sends and deletes message after delay with fallback for Markdown errors
 * @param {object} ctx - Telegraf context
 * @param {string} method - Reply method
 * @param {any} content - Message content
 * @param {object} options - Reply options
 * @param {number} delay - Deletion delay
 * @returns {Promise<object>} Sent message
 */
const messageQueue = [];
const replyAndDelete = async (ctx, method, content, options = {}, delay = MESSAGE_DELETE_DELAY) => {
  try {
    const lang = ctx.session.lang || 'fa';
    // Escape محتوای ارسالی برای MarkdownV2
    const escapedContent = typeof content === 'string' ? escapeMarkdownV2(content) : content;
    let sentMessage;
    try {
      sentMessage = await ctx[method](escapedContent, { parse_mode: 'MarkdownV2', ...options });
    } catch (err) {
      if (err.error_code === 400 && err.description.includes("can't parse entities")) {
        console.warn(`MarkdownV2 parse error: ${err.description}, falling back to plain text`);
        sentMessage = await ctx[method](content.replace(/\\([_*[\]()~`>#+\-=|{}.!\\])/g, '$1'), { ...options, parse_mode: undefined });
      } else {
        throw err;
      }
    }
    messageQueue.push({ chatId: ctx.chat.id, messageId: sentMessage.message_id, timestamp: Date.now(), delay });
    return sentMessage;
  } catch (err) {
    console.error(`Error sending message: ${err.message}`, err);
    if (ctx && ctx.chat) {
      try {
        await ctx.reply(i18n[ctx.session.lang || 'fa'].error_generic.replace(/\\([_*[\]()~`>#+\-=|{}.!\\])/g, '$1'));
      } catch (fallbackErr) {
        console.error(`Error sending fallback message: ${fallbackErr.message}`);
      }
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
        console.error(`Error deleting message ${messageId}:`, err.message);
      }
    }
  }
}, 1000);

/**
 * Displays folder content with preview for text and images
 * @param {object} ctx - Telegraf context
 * @param {object} folder - Folder data
 */
const showFolderContent = async (ctx, folder) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const lang = ctx.session.lang || 'fa';
    const [files] = await conn.execute('SELECT * FROM folder_files WHERE folder_id = ?', [folder.id]);
    let caption = `📁 *${escapeMarkdownV2(folder.folder_name)}*\n`;
    if (folder.description) caption += `📝 ${i18n[lang].description_prompt.slice(0, -1)}: ${escapeMarkdownV2(folder.description)}\n`;
    if (folder.tags) caption += `🏷️ ${i18n[lang].tags_prompt.slice(0, -1)}: ${escapeMarkdownV2(folder.tags)}\n`;
    caption += `🕒 Created: ${escapeMarkdownV2(new Date(folder.created_at).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US'))}`;
    
    if (caption.length > 1000) caption = caption.slice(0, 1000) + '...';

    const buttons = Markup.inlineKeyboard([
      [Markup.button.callback(i18n[lang].details, `DETAILS_${folder.id}`)],
      [Markup.button.callback(i18n[lang].add, `ADD_${folder.id}`)],
      [Markup.button.callback(i18n[lang].share, `SHARE_${folder.id}`)],
      [Markup.button.callback(i18n[lang].delete, `DELETE_${folder.id}`)],
      [Markup.button.callback(i18n[lang].edit, `EDIT_${folder.id}`)],
      [Markup.button.callback(i18n[lang].delete_file, `DELETE_FILE_${folder.id}`)]
    ]);

    if (folder.cover_file_path) {
      await replyAndDelete(ctx, 'replyWithPhoto', { source: require('fs').createReadStream(folder.cover_file_path) }, {
        caption,
        parse_mode: 'MarkdownV2',
        ...buttons
      });
    } else {
      await replyAndDelete(ctx, 'reply', caption, { parse_mode: 'MarkdownV2', ...buttons });
    }

    const mediaGroup = files.filter(f => ['photo', 'video'].includes(f.file_type))
      .map(f => ({ type: f.file_type, media: { source: require('fs').createReadStream(f.file_path) }, caption: f.file_type === 'photo' ? 'Thumbnail' : '' }));
    for (let i = 0; i < mediaGroup.length; i += 10) {
      const chunk = mediaGroup.slice(i, i + 10);
      const sentMessages = await ctx.replyWithMediaGroup(chunk);
      sentMessages.forEach(msg => {
        messageQueue.push({ chatId: ctx.chat.id, messageId: msg.message_id, timestamp: Date.now(), delay: 30000 });
      });
    }

    for (const file of files) {
      if (file.file_type === 'text') {
        let textContent = file.text_content || 'Empty text';
        if (textContent.length > 1000) textContent = textContent.slice(0, 1000) + '...';
        await replyAndDelete(ctx, 'reply', `📜 Text Preview: ${escapeMarkdownV2(textContent)}`, { parse_mode: 'MarkdownV2' });
      } else if (!['photo', 'video'].includes(file.file_type)) {
        const fileStream = require('fs').createReadStream(file.file_path);
        switch (file.file_type) {
          case 'animation': await replyAndDelete(ctx, 'replyWithAnimation', { source: fileStream }); break;
          case 'audio': await replyAndDelete(ctx, 'replyWithAudio', { source: fileStream }); break;
          case 'voice': await replyAndDelete(ctx, 'replyWithVoice', { source: fileStream }); break;
          case 'document': await replyAndDelete(ctx, 'replyWithDocument', { source: fileStream }); break;
          case 'sticker': await replyAndDelete(ctx, 'replyWithSticker', { source: fileStream }); break;
        }
      }
    }
    await replyAndDelete(ctx, 'reply', i18n[lang].try_other_commands, { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() });
  } catch (err) {
    await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
    console.error('Error in showFolderContent:', err);
  } finally {
    if (conn) conn.release();
  }
};

// Scenes
const createFolderScene = new BaseScene('CREATE_FOLDER_SCENE');
createFolderScene.enter(ctx => {
  ctx.session.newFolder = { step: 'name', files: [], prevSteps: [] };
  const lang = ctx.session.lang || 'fa';
  return replyAndDelete(ctx, 'reply', i18n[lang].folder_name_prompt, {
    parse_mode: 'MarkdownV2',
    ...Markup.keyboard([[i18n[lang].cancel], [i18n[lang].back], [i18n[lang].help]]).oneTime().resize()
  });
});
createFolderScene.on('text', async ctx => {
  const nf = ctx.session.newFolder;
  const lang = ctx.session.lang || 'fa';
  const text = sanitizeInput(ctx.message.text.trim());
  
  if (text === i18n[lang].cancel) {
    delete ctx.session.newFolder;
    await replyAndDelete(ctx, 'reply', i18n[lang].cancelled, { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() });
    return ctx.scene.leave();
  }
  
  if (text === i18n[lang].back && nf.prevSteps.length > 0) {
    nf.step = nf.prevSteps.pop();
    return replyAndDelete(ctx, 'reply', i18n[lang][`${nf.step}_prompt`], {
      parse_mode: 'MarkdownV2',
      ...Markup.keyboard([[i18n[lang].cancel], [i18n[lang].back], [i18n[lang].help]]).oneTime().resize()
    });
  }
  
  if (text === i18n[lang].help) {
    return replyAndDelete(ctx, 'reply', i18n[lang].commands, {
      parse_mode: 'MarkdownV2',
      ...Markup.keyboard([[i18n[lang].cancel], [i18n[lang].back], [i18n[lang].help]]).oneTime().resize()
    });
  }

  if (nf.step === 'name') {
    if (!isValidFolderName(text)) {
      return replyAndDelete(ctx, 'reply', i18n[lang].invalid_folder_name, { parse_mode: 'MarkdownV2' });
    }
    let conn;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.execute('SELECT 1 FROM folders WHERE chat_id = ? AND folder_name = ?', [ctx.chat.id, text]);
      if (rows.length) return replyAndDelete(ctx, 'reply', i18n[lang].error_folder_exists, { parse_mode: 'MarkdownV2' });
      nf.folder_name = text;
      nf.prevSteps.push(nf.step);
      nf.step = 'files';
      return replyAndDelete(ctx, 'reply', i18n[lang].file_upload_prompt, {
        parse_mode: 'MarkdownV2',
        ...Markup.keyboard([[i18n[lang].complete_upload], [i18n[lang].cancel], [i18n[lang].back], [i18n[lang].help]]).oneTime().resize()
      });
    } catch (err) {
      await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
      console.error('Error in CREATE_FOLDER_SCENE (name):', err);
    } finally {
      if (conn) conn.release();
    }
  }
  if (nf.step === 'files') {
    if (text.trim() === i18n[lang].complete_upload.replace(/\\([_*[\]()~`>#+\-=|{}.!\\])/g, '$1')) {
      if (nf.files.length === 0) return replyAndDelete(ctx, 'reply', i18n[lang].no_files_uploaded, { parse_mode: 'MarkdownV2' });
      nf.prevSteps.push(nf.step);
      nf.step = 'description';
      return replyAndDelete(ctx, 'reply', i18n[lang].description_prompt, {
        parse_mode: 'MarkdownV2',
        ...Markup.keyboard([[i18n[lang].skip], [i18n[lang].cancel], [i18n[lang].back], [i18n[lang].help]]).oneTime().resize()
      });
    }
    if (!isValidText(text)) {
      return replyAndDelete(ctx, 'reply', i18n[lang].text_too_long, { parse_mode: 'MarkdownV2' });
    }
    nf.files.push({ fileType: 'text', textContent: text });
    return replyAndDelete(ctx, 'reply', i18n[lang].text_received, { parse_mode: 'MarkdownV2' });
  }
  if (nf.step === 'description') {
    if (text !== i18n[lang].skip) nf.description = text.slice(0, 1000);
    nf.prevSteps.push(nf.step);
    nf.step = 'tags';
    return replyAndDelete(ctx, 'reply', i18n[lang].tags_prompt, {
      parse_mode: 'MarkdownV2',
      ...Markup.keyboard([[i18n[lang].skip], [i18n[lang].cancel], [i18n[lang].back], [i18n[lang].help]]).oneTime().resize()
    });
  }
  if (nf.step === 'tags') {
    if (text !== i18n[lang].skip) nf.tags = text.slice(0, 255);
    nf.prevSteps.push(nf.step);
    nf.step = 'password';
    return replyAndDelete(ctx, 'reply', i18n[lang].password_prompt, {
      parse_mode: 'MarkdownV2',
      ...Markup.keyboard([[i18n[lang].yes], [i18n[lang].no], [i18n[lang].cancel], [i18n[lang].back], [i18n[lang].help]]).oneTime().resize()
    });
  }
  if (nf.step === 'password') {
    if (text === i18n[lang].no) {
      nf.password = null;
      nf.prevSteps.push(nf.step);
      nf.step = 'cover';
      return replyAndDelete(ctx, 'reply', i18n[lang].cover_prompt, {
        parse_mode: 'MarkdownV2',
        ...Markup.keyboard([[i18n[lang].skip], [i18n[lang].cancel], [i18n[lang].back], [i18n[lang].help]]).oneTime().resize()
      });
    }
    if (text === i18n[lang].yes) {
      nf.prevSteps.push(nf.step);
      nf.step = 'set_password';
      return replyAndDelete(ctx, 'reply', i18n[lang].set_password_prompt, {
        parse_mode: 'MarkdownV2',
        ...Markup.keyboard([[i18n[lang].cancel], [i18n[lang].back], [i18n[lang].help]]).oneTime().resize()
      });
    }
  }
  if (nf.step === 'set_password') {
    if (!isValidPassword(text)) return replyAndDelete(ctx, 'reply', i18n[lang].invalid_password, { parse_mode: 'MarkdownV2' });
    try {
      nf.password = await bcrypt.hash(text, SALT_ROUNDS);
    } catch (err) {
      await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
      console.error('Error hashing password:', err);
      return;
    }
    nf.prevSteps.push(nf.step);
    nf.step = 'cover';
    return replyAndDelete(ctx, 'reply', i18n[lang].cover_prompt, {
      parse_mode: 'MarkdownV2',
      ...Markup.keyboard([[i18n[lang].skip], [i18n[lang].cancel], [i18n[lang].back], [i18n[lang].help]]).oneTime().resize()
    });
  }
  if (nf.step === 'cover' && text === i18n[lang].skip) {
    await saveFolder(ctx);
    await replyAndDelete(ctx, 'reply', i18n[lang].folder_saved, { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() });
    return ctx.scene.leave();
  }
});
createFolderScene.on(['document', 'photo', 'video', 'animation', 'audio', 'voice', 'sticker'], async ctx => {
  const nf = ctx.session.newFolder;
  const lang = ctx.session.lang || 'fa';
  if (nf.step === 'files') {
    let fid, fileType;
    if (ctx.message.document) { fid = ctx.message.document.file_id; fileType = 'document'; }
    else if (ctx.message.photo) { fid = ctx.message.photo[ctx.message.photo.length - 1].file_id; fileType = 'photo'; }
    else if (ctx.message.video) { fid = ctx.message.video.file_id; fileType = 'video'; }
    else if (ctx.message.animation) { fid = ctx.message.animation.file_id; fileType = 'animation'; }
    else if (ctx.message.audio) { fid = ctx.message.audio.file_id; fileType = 'audio'; }
    else if (ctx.message.voice) { fid = ctx.message.voice.file_id; fileType = 'voice'; }
    else if (ctx.message.sticker) {
      if (ctx.message.sticker.is_animated) return replyAndDelete(ctx, 'reply', i18n[lang].animated_sticker_not_supported, { parse_mode: 'MarkdownV2' });
      fid = ctx.message.sticker.file_id; fileType = 'sticker';
    }
    try {
      const file = await bot.telegram.getFile(fid);
      if (file.file_size > MAX_FILE_SIZE) return replyAndDelete(ctx, 'reply', i18n[lang].file_too_large, { parse_mode: 'MarkdownV2' });
      nf.files.push({ fid, fileType });
      await replyAndDelete(ctx, 'reply', i18n[lang].file_received, { parse_mode: 'MarkdownV2' });
    } catch (err) {
      await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
      console.error('Error in CREATE_FOLDER_SCENE (files):', err);
    }
  } else if (nf.step === 'cover' && ctx.message.photo) {
    try {
      const fid = ctx.message.photo[ctx.message.photo.length - 1].file_id;
      const file = await bot.telegram.getFile(fid);
      if (file.file_size > MAX_FILE_SIZE) return replyAndDelete(ctx, 'reply', i18n[lang].cover_too_large, { parse_mode: 'MarkdownV2' });
      nf.image_file_id = fid;
      await saveFolder(ctx);
      await replyAndDelete(ctx, 'reply', i18n[lang].folder_saved, { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() });
      return ctx.scene.leave();
    } catch (err) {
      await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
      console.error('Error in CREATE_FOLDER_SCENE (cover):', err);
    }
  }
});

/**
 * Saves folder to database
 * @param {object} ctx - Telegraf context
 */
async function saveFolder(ctx) {
  const nf = ctx.session.newFolder;
  const lang = ctx.session.lang || 'fa';
  let conn;
  try {
    conn = await pool.getConnection();
    const [result] = await conn.execute(
      'INSERT INTO folders (chat_id, folder_name, description, tags, password, cover_file_path) VALUES (?, ?, ?, ?, ?, ?)',
      [ctx.chat.id, nf.folder_name, nf.description || null, nf.tags || null, nf.password || null, null]
    );
    const folderId = result.insertId;
    const userDir = ensureUserDir(ctx.chat.id);
    for (const file of nf.files) {
      if (file.fileType === 'text') {
        await conn.execute(
          'INSERT INTO folder_files (folder_id, file_path, file_type, text_content) VALUES (?, ?, ?, ?)',
          [folderId, '', 'text', file.textContent]
        );
      } else {
        const [fileResult] = await conn.execute(
          'INSERT INTO folder_files (folder_id, file_path, file_type) VALUES (?, ?, ?)',
          [folderId, 'pending', file.fileType]
        );
        const fileId = fileResult.insertId;
        const destBase = path.join(userDir, `${folderId}_${fileId}`);
        const filePath = await downloadFile(file.fid, destBase, file.fileType);
        await conn.execute('UPDATE folder_files SET file_path = ? WHERE id = ?', [filePath, fileId]);
      }
    }
    if (nf.image_file_id) {
      const destBase = path.join(userDir, `${folderId}_cover`);
      const coverPath = await downloadFile(nf.image_file_id, destBase, 'photo');
      await conn.execute('UPDATE folders SET cover_file_path = ? WHERE id = ?', [coverPath, folderId]);
    }
  } catch (err) {
    await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
    console.error('Error in saveFolder:', err);
  } finally {
    if (conn) conn.release();
    delete ctx.session.newFolder;
  }
}

const openFolderScene = new BaseScene('OPEN_FOLDER_SCENE');
openFolderScene.enter(ctx => {
  const lang = ctx.session.lang || 'fa';
  ctx.session.openFolder = { step: 'name' };
  return replyAndDelete(ctx, 'reply', i18n[lang].folder_name_prompt, {
    parse_mode: 'MarkdownV2',
    ...Markup.keyboard([[i18n[lang].cancel], [i18n[lang].help]]).oneTime().resize()
  });
});
openFolderScene.on('text', async ctx => {
  const lang = ctx.session.lang || 'fa';
  const text = sanitizeInput(ctx.message.text.trim());
  const openFolder = ctx.session.openFolder;
  
  if (text === i18n[lang].cancel) {
    delete ctx.session.openFolder;
    await replyAndDelete(ctx, 'reply', i18n[lang].cancelled, { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() });
    return ctx.scene.leave();
  }
  
  if (text === i18n[lang].help) {
    return replyAndDelete(ctx, 'reply', i18n[lang].commands, {
      parse_mode: 'MarkdownV2',
      ...Markup.keyboard([[i18n[lang].cancel], [i18n[lang].help]]).oneTime().resize()
    });
  }

  if (openFolder.step === 'name') {
    let conn;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.execute('SELECT * FROM folders WHERE chat_id = ? AND folder_name = ?', [ctx.chat.id, text]);
      if (!rows.length) return replyAndDelete(ctx, 'reply', i18n[lang].folder_not_found, { parse_mode: 'MarkdownV2' });
      openFolder.folder = rows[0];
      if (openFolder.folder.password) {
        openFolder.step = 'password';
        return replyAndDelete(ctx, 'reply', i18n[lang].password_required, {
          parse_mode: 'MarkdownV2',
          ...Markup.keyboard([[i18n[lang].cancel], [i18n[lang].help]]).oneTime().resize()
        });
      }
      await showFolderContent(ctx, openFolder.folder);
      delete ctx.session.openFolder;
      return ctx.scene.leave();
    } catch (err) {
      await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
      console.error('Error in OPEN_FOLDER_SCENE:', err);
    } finally {
      if (conn) conn.release();
    }
  } else if (openFolder.step === 'password') {
    try {
      const match = await bcrypt.compare(text, openFolder.folder.password);
      if (!match) return replyAndDelete(ctx, 'reply', i18n[lang].wrong_password, { parse_mode: 'MarkdownV2' });
      await showFolderContent(ctx, openFolder.folder);
      delete ctx.session.openFolder;
      return ctx.scene.leave();
    } catch (err) {
      await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
      console.error('Error in OPEN_FOLDER_SCENE (password):', err);
      return ctx.scene.leave();
    }
  }
});

const listFoldersScene = new BaseScene('LIST_FOLDERS_SCENE');
listFoldersScene.enter(async ctx => {
  const lang = ctx.session.lang || 'fa';
  ctx.session.listFolders = { page: 1 };
  await showFolderList(ctx, 1);
});
listFoldersScene.on('text', async ctx => {
  const lang = ctx.session.lang || 'fa';
  const text = sanitizeInput(ctx.message.text.trim());
  if (text === i18n[lang].cancel) {
    delete ctx.session.listFolders;
    await replyAndDelete(ctx, 'reply', i18n[lang].cancelled, { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() });
    return ctx.scene.leave();
  }
});
listFoldersScene.action(/PAGE_(\d+)/, async ctx => {
  const page = parseInt(ctx.match[1], 10);
  await showFolderList(ctx, page);
});

/**
 * Shows paginated folder list
 * @param {object} ctx - Telegraf context
 * @param {number} page - Page number
 */
async function showFolderList(ctx, page) {
  let conn;
  const lang = ctx.session.lang || 'fa';
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.execute('SELECT folder_name FROM folders WHERE chat_id = ?', [ctx.chat.id]);
    if (!rows.length) return replyAndDelete(ctx, 'reply', i18n[lang].no_folders, { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() });
    
    const totalPages = Math.ceil(rows.length / PAGE_SIZE);
    const start = (page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const folderList = rows.slice(start, end).map(r => escapeMarkdownV2(r.folder_name)).join('\n');
    
    const buttons = [];
    if (page > 1) buttons.push(Markup.button.callback('Previous', `PAGE_${page - 1}`));
    if (page < totalPages) buttons.push(Markup.button.callback('Next', `PAGE_${page + 1}`));
    
    await replyAndDelete(ctx, 'reply', `📋 ${i18n[lang].folder_list}:\n${folderList}`, {
      parse_mode: 'MarkdownV2',
      ...Markup.inlineKeyboard([buttons])
    });
  } catch (err) {
    await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
    console.error('Error in showFolderList:', err);
  } finally {
    if (conn) conn.release();
  }
}

const addFilesScene = new BaseScene('ADD_FILES_SCENE');
addFilesScene.enter(ctx => {
  const lang = ctx.session.lang || 'fa';
  ctx.session.addFiles = { step: 'folder', files: [] };
  return replyAndDelete(ctx, 'reply', i18n[lang].folder_name_prompt, {
    parse_mode: 'MarkdownV2',
    ...Markup.keyboard([[i18n[lang].cancel], [i18n[lang].help]]).oneTime().resize()
  });
});
addFilesScene.on('text', async ctx => {
  const af = ctx.session.addFiles;
  const lang = ctx.session.lang || 'fa';
  const text = sanitizeInput(ctx.message.text.trim());
  
  if (text === i18n[lang].cancel) {
    delete ctx.session.addFiles;
    await replyAndDelete(ctx, 'reply', i18n[lang].cancelled, { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() });
    return ctx.scene.leave();
  }
  
  if (text === i18n[lang].help) {
    return replyAndDelete(ctx, 'reply', i18n[lang].commands, {
      parse_mode: 'MarkdownV2',
      ...Markup.keyboard([[i18n[lang].cancel], [i18n[lang].help]]).oneTime().resize()
    });
  }

  if (af.step === 'folder') {
    let conn;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.execute('SELECT id FROM folders WHERE chat_id = ? AND folder_name = ?', [ctx.chat.id, text]);
      if (!rows.length) return replyAndDelete(ctx, 'reply', i18n[lang].folder_not_found, { parse_mode: 'MarkdownV2' });
      af.folder_id = rows[0].id;
      af.step = 'files';
      return replyAndDelete(ctx, 'reply', i18n[lang].file_upload_prompt, {
        parse_mode: 'MarkdownV2',
        ...Markup.keyboard([[i18n[lang].complete_upload], [i18n[lang].cancel], [i18n[lang].help]]).oneTime().resize()
      });
    } catch (err) {
      await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
      console.error('Error in ADD_FILES_SCENE (folder):', err);
    } finally {
      if (conn) conn.release();
    }
  }
  if (af.step === 'files') {
    if (text.trim() === i18n[lang].complete_upload.replace(/\\([_*[\]()~`>#+\-=|{}.!\\])/g, '$1')) {
      if (af.files.length === 0) return replyAndDelete(ctx, 'reply', i18n[lang].no_files_uploaded, { parse_mode: 'MarkdownV2' });
      let conn;
      try {
        conn = await pool.getConnection();
        const userDir = ensureUserDir(ctx.chat.id);
        for (const file of af.files) {
          if (file.fileType === 'text') {
            await conn.execute(
              'INSERT INTO folder_files (folder_id, file_path, file_type, text_content) VALUES (?, ?, ?, ?)',
              [af.folder_id, '', 'text', file.textContent]
            );
          } else {
            const [fileResult] = await conn.execute(
              'INSERT INTO folder_files (folder_id, file_path, file_type) VALUES (?, ?, ?)',
              [af.folder_id, 'pending', file.fileType]
            );
            const fileId = fileResult.insertId;
            const destBase = path.join(userDir, `${af.folder_id}_${fileId}`);
            const filePath = await downloadFile(file.fid, destBase, file.fileType);
            await conn.execute('UPDATE folder_files SET file_path = ? WHERE id = ?', [filePath, fileId]);
          }
        }
        await replyAndDelete(ctx, 'reply', i18n[lang].files_added, { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() });
      } catch (err) {
        await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
        console.error('Error in ADD_FILES_SCENE (save):', err);
      } finally {
        if (conn) conn.release();
        delete ctx.session.addFiles;
        return ctx.scene.leave();
      }
    }
    if (!isValidText(text)) {
      return replyAndDelete(ctx, 'reply', i18n[lang].text_too_long, { parse_mode: 'MarkdownV2' });
    }
    af.files.push({ fileType: 'text', textContent: text });
    return replyAndDelete(ctx, 'reply', i18n[lang].text_received, { parse_mode: 'MarkdownV2' });
  }
});
addFilesScene.on(['document', 'photo', 'video', 'animation', 'audio', 'voice', 'sticker'], async ctx => {
  const af = ctx.session.addFiles;
  const lang = ctx.session.lang || 'fa';
  if (af.step === 'files') {
    let fid, fileType;
    if (ctx.message.document) { fid = ctx.message.document.file_id; fileType = 'document'; }
    else if (ctx.message.photo) { fid = ctx.message.photo[ctx.message.photo.length - 1].file_id; fileType = 'photo'; }
    else if (ctx.message.video) { fid = ctx.message.video.file_id; fileType = 'video'; }
    else if (ctx.message.animation) { fid = ctx.message.animation.file_id; fileType = 'animation'; }
    else if (ctx.message.audio) { fid = ctx.message.audio.file_id; fileType = 'audio'; }
    else if (ctx.message.voice) { fid = ctx.message.voice.file_id; fileType = 'voice'; }
    else if (ctx.message.sticker) {
      if (ctx.message.sticker.is_animated) return replyAndDelete(ctx, 'reply', i18n[lang].animated_sticker_not_supported, { parse_mode: 'MarkdownV2' });
      fid = ctx.message.sticker.file_id; fileType = 'sticker';
    }
    try {
      const file = await bot.telegram.getFile(fid);
      if (file.file_size > MAX_FILE_SIZE) return replyAndDelete(ctx, 'reply', i18n[lang].file_too_large, { parse_mode: 'MarkdownV2' });
      af.files.push({ fid, fileType });
      await replyAndDelete(ctx, 'reply', i18n[lang].file_received, { parse_mode: 'MarkdownV2' });
    } catch (err) {
      await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
      console.error('Error in ADD_FILES_SCENE (files):', err);
    }
  }
});

const searchFoldersScene = new BaseScene('SEARCH_FOLDERS_SCENE');
searchFoldersScene.enter(ctx => {
  const lang = ctx.session.lang || 'fa';
  ctx.session.searchFolders = { page: 1 };
  return replyAndDelete(ctx, 'reply', i18n[lang].search_prompt, {
    parse_mode: 'MarkdownV2',
    ...Markup.keyboard([[i18n[lang].cancel], [i18n[lang].help]]).oneTime().resize()
  });
});
searchFoldersScene.on('text', async ctx => {
  const lang = ctx.session.lang || 'fa';
  const text = sanitizeInput(ctx.message.text.trim());
  if (text === i18n[lang].cancel) {
    delete ctx.session.searchFolders;
    await replyAndDelete(ctx, 'reply', i18n[lang].cancelled, { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() });
    return ctx.scene.leave();
  }
  if (text === i18n[lang].help) {
    return replyAndDelete(ctx, 'reply', i18n[lang].commands, {
      parse_mode: 'MarkdownV2',
      ...Markup.keyboard([[i18n[lang].cancel], [i18n[lang].help]]).oneTime().resize()
    });
  }
  ctx.session.searchFolders.query = text;
  await showSearchResults(ctx, 1);
});
searchFoldersScene.action(/SEARCH_PAGE_(\d+)/, async ctx => {
  const page = parseInt(ctx.match[1], 10);
  await showSearchResults(ctx, page);
});

/**
 * Shows paginated search results
 * @param {object} ctx - Telegraf context
 * @param {number} page - Page number
 */
async function showSearchResults(ctx, page) {
  let conn;
  const lang = ctx.session.lang || 'fa';
  try {
    conn = await pool.getConnection();
    const query = ctx.session.searchFolders.query;
    const [rows] = await conn.execute(
      'SELECT DISTINCT f.folder_name FROM folders f LEFT JOIN folder_files ff ON f.id = ff.folder_id WHERE f.chat_id = ? AND (f.folder_name LIKE ? OR f.description LIKE ? OR f.tags LIKE ? OR ff.text_content LIKE ?)',
      [ctx.chat.id, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`]
    );
    if (!rows.length) return replyAndDelete(ctx, 'reply', i18n[lang].no_results, { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() });
    
    const totalPages = Math.ceil(rows.length / PAGE_SIZE);
    const start = (page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const folderList = rows.slice(start, end).map(r => escapeMarkdownV2(r.folder_name)).join('\n');
    
    const buttons = [];
    if (page > 1) buttons.push(Markup.button.callback('Previous', `SEARCH_PAGE_${page - 1}`));
    if (page < totalPages) buttons.push(Markup.button.callback('Next', `SEARCH_PAGE_${page + 1}`));
    
    await replyAndDelete(ctx, 'reply', `📋 ${i18n[lang].search_results}:\n${folderList}`, {
      parse_mode: 'MarkdownV2',
      ...Markup.inlineKeyboard([buttons])
    });
  } catch (err) {
    await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
    console.error('Error in showSearchResults:', err);
  } finally {
    if (conn) conn.release();
  }
}

const editFolderScene = new BaseScene('EDIT_FOLDER_SCENE');
editFolderScene.enter(ctx => {
  const lang = ctx.session.lang || 'fa';
  ctx.session.editFolder = { step: 'name' };
  return replyAndDelete(ctx, 'reply', i18n[lang].folder_name_prompt, {
    parse_mode: 'MarkdownV2',
    ...Markup.keyboard([[i18n[lang].cancel], [i18n[lang].help]]).oneTime().resize()
  });
});
editFolderScene.on('text', async ctx => {
  const lang = ctx.session.lang || 'fa';
  const text = sanitizeInput(ctx.message.text.trim());
  const ef = ctx.session.editFolder;
  
  if (text === i18n[lang].cancel) {
    delete ctx.session.editFolder;
    await replyAndDelete(ctx, 'reply', i18n[lang].cancelled, { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() });
    return ctx.scene.leave();
  }
  
  if (text === i18n[lang].help) {
    return replyAndDelete(ctx, 'reply', i18n[lang].commands, {
      parse_mode: 'MarkdownV2',
      ...Markup.keyboard([[i18n[lang].cancel], [i18n[lang].help]]).oneTime().resize()
    });
  }

  if (ef.step === 'name') {
    let conn;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.execute('SELECT * FROM folders WHERE chat_id = ? AND folder_name = ?', [ctx.chat.id, text]);
      if (!rows.length) return replyAndDelete(ctx, 'reply', i18n[lang].folder_not_found, { parse_mode: 'MarkdownV2' });
      ef.folder = rows[0];
      if (ef.folder.password) {
        ef.step = 'password';
        return replyAndDelete(ctx, 'reply', i18n[lang].password_required, {
          parse_mode: 'MarkdownV2',
          ...Markup.keyboard([[i18n[lang].cancel], [i18n[lang].help]]).oneTime().resize()
        });
      }
      ef.step = 'field';
      return replyAndDelete(ctx, 'reply', '✏️ چه چیزی را ویرایش کنید؟', {
        parse_mode: 'MarkdownV2',
        ...Markup.keyboard([
          ['نام', 'توضیحات', 'تگ‌ها'],
          ['رمز عبور', 'عکس کاور'],
          [i18n[lang].cancel, i18n[lang].help]
        ]).oneTime().resize()
      });
    } catch (err) {
      await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
      console.error('Error in EDIT_FOLDER_SCENE (name):', err);
    } finally {
      if (conn) conn.release();
    }
  }
  if (ef.step === 'password') {
    try {
      const match = await bcrypt.compare(text, ef.folder.password);
      if (!match) return replyAndDelete(ctx, 'reply', i18n[lang].wrong_password, { parse_mode: 'MarkdownV2' });
      ef.step = 'field';
      return replyAndDelete(ctx, 'reply', '✏️ چه چیزی را ویرایش کنید؟', {
        parse_mode: 'MarkdownV2',
        ...Markup.keyboard([
          ['نام', 'توضیحات', 'تگ‌ها'],
          ['رمز عبور', 'عکس کاور'],
          [i18n[lang].cancel, i18n[lang].help]
        ]).oneTime().resize()
      });
    } catch (err) {
      await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
      console.error('Error in EDIT_FOLDER_SCENE (password):', err);
      return ctx.scene.leave();
    }
  }
  if (ef.step === 'field') {
    if (text === 'نام') {
      ef.step = 'edit_name';
      return replyAndDelete(ctx, 'reply', i18n[lang].folder_name_prompt, {
        parse_mode: 'MarkdownV2',
        ...Markup.keyboard([[i18n[lang].cancel], [i18n[lang].help]]).oneTime().resize()
      });
    }
    if (text === 'توضیحات') {
      ef.step = 'edit_description';
      return replyAndDelete(ctx, 'reply', i18n[lang].description_prompt, {
        parse_mode: 'MarkdownV2',
        ...Markup.keyboard([[i18n[lang].skip], [i18n[lang].cancel], [i18n[lang].help]]).oneTime().resize()
      });
    }
    if (text === 'تگ‌ها') {
      ef.step = 'edit_tags';
      return replyAndDelete(ctx, 'reply', i18n[lang].tags_prompt, {
        parse_mode: 'MarkdownV2',
        ...Markup.keyboard([[i18n[lang].skip], [i18n[lang].cancel], [i18n[lang].help]]).oneTime().resize()
      });
    }
    if (text === 'رمز عبور') {
      ef.step = 'edit_password';
      return replyAndDelete(ctx, 'reply', i18n[lang].set_password_prompt, {
        parse_mode: 'MarkdownV2',
        ...Markup.keyboard([[i18n[lang].skip], [i18n[lang].cancel], [i18n[lang].help]]).oneTime().resize()
      });
    }
    if (text === 'عکس کاور') {
      ef.step = 'edit_cover';
      return replyAndDelete(ctx, 'reply', i18n[lang].cover_prompt, {
        parse_mode: 'MarkdownV2',
        ...Markup.keyboard([[i18n[lang].skip], [i18n[lang].cancel], [i18n[lang].help]]).oneTime().resize()
      });
    }
  }
  if (ef.step === 'edit_name') {
    if (!isValidFolderName(text)) return replyAndDelete(ctx, 'reply', i18n[lang].invalid_folder_name, { parse_mode: 'MarkdownV2' });
    let conn;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.execute('SELECT 1 FROM folders WHERE chat_id = ? AND folder_name = ? AND id != ?', [ctx.chat.id, text, ef.folder.id]);
      if (rows.length) return replyAndDelete(ctx, 'reply', i18n[lang].error_folder_exists, { parse_mode: 'MarkdownV2' });
      await conn.execute('UPDATE folders SET folder_name = ? WHERE id = ?', [text, ef.folder.id]);
      await replyAndDelete(ctx, 'reply', '✅ نام پوشه به‌روزرسانی شد\\.', { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() });
      delete ctx.session.editFolder;
      return ctx.scene.leave();
    } catch (err) {
      await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
      console.error('Error in EDIT_FOLDER_SCENE (edit_name):', err);
    } finally {
      if (conn) conn.release();
    }
  }
  if (ef.step === 'edit_description') {
    let conn;
    try {
      conn = await pool.getConnection();
      await conn.execute('UPDATE folders SET description = ? WHERE id = ?', [text === i18n[lang].skip ? null : text.slice(0, 1000), ef.folder.id]);
      await replyAndDelete(ctx, 'reply', '✅ توضیحات به‌روزرسانی شد\\.', { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() });
      delete ctx.session.editFolder;
      return ctx.scene.leave();
    } catch (err) {
      await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
      console.error('Error in EDIT_FOLDER_SCENE (edit_description):', err);
    } finally {
      if (conn) conn.release();
    }
  }
  if (ef.step === 'edit_tags') {
    let conn;
    try {
      conn = await pool.getConnection();
      await conn.execute('UPDATE folders SET tags = ? WHERE id = ?', [text === i18n[lang].skip ? null : text.slice(0, 255), ef.folder.id]);
      await replyAndDelete(ctx, 'reply', '✅ تگ‌ها به‌روزرسانی شد\\.', { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() });
      delete ctx.session.editFolder;
      return ctx.scene.leave();
    } catch (err) {
      await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
      console.error('Error in EDIT_FOLDER_SCENE (edit_tags):', err);
    } finally {
      if (conn) conn.release();
    }
  }
  if (ef.step === 'edit_password') {
    let conn;
    try {
      conn = await pool.getConnection();
      const password = text === i18n[lang].skip ? null : await bcrypt.hash(text, SALT_ROUNDS);
      await conn.execute('UPDATE folders SET password = ? WHERE id = ?', [password, ef.folder.id]);
      await replyAndDelete(ctx, 'reply', '✅ رمز عبور به‌روزرسانی شد\\.', { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() });
      delete ctx.session.editFolder;
      return ctx.scene.leave();
    } catch (err) {
      await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
      console.error('Error in EDIT_FOLDER_SCENE (edit_password):', err);
    } finally {
      if (conn) conn.release();
    }
  }
});
editFolderScene.on('photo', async ctx => {
  const ef = ctx.session.editFolder;
  const lang = ctx.session.lang || 'fa';
  if (ef.step === 'edit_cover') {
    try {
      const fid = ctx.message.photo[ctx.message.photo.length - 1].file_id;
      const file = await bot.telegram.getFile(fid);
      if (file.file_size > MAX_FILE_SIZE) return replyAndDelete(ctx, 'reply', i18n[lang].cover_too_large, { parse_mode: 'MarkdownV2' });
      const userDir = ensureUserDir(ctx.chat.id);
      const destBase = path.join(userDir, `${ef.folder.id}_cover`);
      const coverPath = await downloadFile(fid, destBase, 'photo');
      let conn;
      try {
        conn = await pool.getConnection();
        await conn.execute('UPDATE folders SET cover_file_path = ? WHERE id = ?', [coverPath, ef.folder.id]);
        await replyAndDelete(ctx, 'reply', '✅ عکس کاور به‌روزرسانی شد\\.', { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() });
        delete ctx.session.editFolder;
        return ctx.scene.leave();
      } finally {
        if (conn) conn.release();
      }
    } catch (err) {
      await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
      console.error('Error in EDIT_FOLDER_SCENE (edit_cover):', err);
    }
  }
});

const deleteFileScene = new BaseScene('DELETE_FILE_SCENE');
deleteFileScene.enter(ctx => {
  const lang = ctx.session.lang || 'fa';
  ctx.session.deleteFile = { step: 'name' };
  return replyAndDelete(ctx, 'reply', i18n[lang].folder_name_prompt, {
    parse_mode: 'MarkdownV2',
    ...Markup.keyboard([[i18n[lang].cancel], [i18n[lang].help]]).oneTime().resize()
  });
});
deleteFileScene.on('text', async ctx => {
  const lang = ctx.session.lang || 'fa';
  const text = sanitizeInput(ctx.message.text.trim());
  const df = ctx.session.deleteFile;
  
  if (text === i18n[lang].cancel) {
    delete ctx.session.deleteFile;
    await replyAndDelete(ctx, 'reply', i18n[lang].cancelled, { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() });
    return ctx.scene.leave();
  }
  
  if (text === i18n[lang].help) {
    return replyAndDelete(ctx, 'reply', i18n[lang].commands, {
      parse_mode: 'MarkdownV2',
      ...Markup.keyboard([[i18n[lang].cancel], [i18n[lang].help]]).oneTime().resize()
    });
  }

  if (df.step === 'name') {
    let conn;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.execute('SELECT * FROM folders WHERE chat_id = ? AND folder_name = ?', [ctx.chat.id, text]);
      if (!rows.length) return replyAndDelete(ctx, 'reply', i18n[lang].folder_not_found, { parse_mode: 'MarkdownV2' });
      df.folder = rows[0];
      if (df.folder.password) {
        df.step = 'password';
        return replyAndDelete(ctx, 'reply', i18n[lang].password_required, {
          parse_mode: 'MarkdownV2',
          ...Markup.keyboard([[i18n[lang].cancel], [i18n[lang].help]]).oneTime().resize()
        });
      }
      df.step = 'select_file';
      await showFileList(ctx);
    } catch (err) {
      await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
      console.error('Error in DELETE_FILE_SCENE (name):', err);
    } finally {
      if (conn) conn.release();
    }
  }
  if (df.step === 'password') {
    try {
      const match = await bcrypt.compare(text, df.folder.password);
      if (!match) return replyAndDelete(ctx, 'reply', i18n[lang].wrong_password, { parse_mode: 'MarkdownV2' });
      df.step = 'select_file';
      await showFileList(ctx);
    } catch (err) {
      await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
      console.error('Error in DELETE_FILE_SCENE (password):', err);
      return ctx.scene.leave();
    }
  }
});
deleteFileScene.action(/DELETE_FILE_(\d+)_(\d+)/, async ctx => {
  const folderId = ctx.match[1];
  const fileId = ctx.match[2];
  const lang = ctx.session.lang || 'fa';
  let conn;
  try {
    conn = await pool.getConnection();
    const [files] = await conn.execute('SELECT file_path FROM folder_files WHERE id = ? AND folder_id = ?', [fileId, folderId]);
    if (!files.length) return replyAndDelete(ctx, 'reply', i18n[lang].file_not_found, { parse_mode: 'MarkdownV2' });
    await conn.execute('DELETE FROM folder_files WHERE id = ?', [fileId]);
    await fs.unlink(files[0].file_path);
    await replyAndDelete(ctx, 'reply', i18n[lang].file_deleted, { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() });
    delete ctx.session.deleteFile;
    return ctx.scene.leave();
  } catch (err) {
    await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
    console.error('Error in DELETE_FILE_SCENE (action):', err);
  } finally {
    if (conn) conn.release();
  }
});

/**
 * Shows list of files for deletion
 * @param {object} ctx - Telegraf context
 */
async function showFileList(ctx) {
  const lang = ctx.session.lang || 'fa';
  const df = ctx.session.deleteFile;
  let conn;
  try {
    conn = await pool.getConnection();
    const [files] = await conn.execute('SELECT id, file_type, text_content FROM folder_files WHERE folder_id = ?', [df.folder.id]);
    if (!files.length) {
      await replyAndDelete(ctx, 'reply', i18n[lang].no_files, { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() });
      delete ctx.session.deleteFile;
      return ctx.scene.leave();
    }
    const buttons = files.map(file => {
      const name = file.file_type === 'text' ? (escapeMarkdownV2(file.text_content?.slice(0, 20)) || 'Text') : file.file_type;
      return [Markup.button.callback(name, `DELETE_FILE_${df.folder.id}_${file.id}`)];
    });
    await replyAndDelete(ctx, 'reply', i18n[lang].select_file_to_delete, {
      parse_mode: 'MarkdownV2',
      ...Markup.inlineKeyboard(buttons)
    });
  } catch (err) {
    await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
    console.error('Error in showFileList:', err);
  } finally {
    if (conn) conn.release();
  }
}

const deletePasswordScene = new BaseScene('DELETE_PASSWORD_SCENE');
deletePasswordScene.enter(ctx => {
  const lang = ctx.session.lang || 'fa';
  return replyAndDelete(ctx, 'reply', i18n[lang].password_required, {
    parse_mode: 'MarkdownV2',
    ...Markup.keyboard([[i18n[lang].cancel], [i18n[lang].help]]).oneTime().resize()
  });
});
deletePasswordScene.on('text', async ctx => {
  const lang = ctx.session.lang || 'fa';
  const text = sanitizeInput(ctx.message.text.trim());
  if (text === i18n[lang].cancel) {
    delete ctx.session.folderToDelete;
    await replyAndDelete(ctx, 'reply', i18n[lang].cancelled, { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() });
    return ctx.scene.leave();
  }
  if (text === i18n[lang].help) {
    return replyAndDelete(ctx, 'reply', i18n[lang].commands, {
      parse_mode: 'MarkdownV2',
      ...Markup.keyboard([[i18n[lang].cancel], [i18n[lang].help]]).oneTime().resize()
    });
  }
  const folder = ctx.session.folderToDelete;
  if (!folder) {
    await replyAndDelete(ctx, 'reply', i18n[lang].folder_not_found, { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() });
    return ctx.scene.leave();
  }
  let conn;
  try {
    conn = await pool.getConnection();
    const match = await bcrypt.compare(text, folder.password);
    if (!match) return replyAndDelete(ctx, 'reply', i18n[lang].wrong_password, { parse_mode: 'MarkdownV2' });
    await conn.execute('DELETE FROM folder_files WHERE folder_id = ?', [folder.id]);
    await conn.execute('DELETE FROM folders WHERE id = ?', [folder.id]);
    const userDir = ensureUserDir(ctx.chat.id);
    const folderFiles = await fs.readdir(userDir);
    for (const file of folderFiles) {
      if (file.startsWith(`${folder.id}_`)) {
        await fs.unlink(path.join(userDir, file));
      }
    }
    await replyAndDelete(ctx, 'reply', i18n[lang].folder_deleted, { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() });
    delete ctx.session.folderToDelete;
    return ctx.scene.leave();
  } catch (err) {
    await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
    console.error('Error in DELETE_PASSWORD_SCENE:', err);
    return ctx.scene.leave();
  } finally {
    if (conn) conn.release();
  }
});

// Setup scenes
const stage = new Stage([
  createFolderScene,
  openFolderScene,
  listFoldersScene,
  addFilesScene,
  searchFoldersScene,
  editFolderScene,
  deleteFileScene,
  deletePasswordScene
]);
bot.use(session());
bot.use(stage.middleware());

// Register YouTube functionality
registerYouTube(bot, stage, pool);

// Bot commands
bot.command('CrFolders', ctx => ctx.scene.enter('CREATE_FOLDER_SCENE'));
bot.command('OpenFolder', ctx => ctx.scene.enter('OPEN_FOLDER_SCENE'));
bot.command('ListFolders', ctx => ctx.scene.enter('LIST_FOLDERS_SCENE'));
bot.command('SearchFolders', ctx => ctx.scene.enter('SEARCH_FOLDERS_SCENE'));
bot.command('EditFolder', ctx => ctx.scene.enter('EDIT_FOLDER_SCENE'));
bot.command('DeleteFile', ctx => ctx.scene.enter('DELETE_FILE_SCENE'));
bot.start(ctx => {
  ctx.session.lang = ctx.session.lang || 'fa';
  return replyAndDelete(ctx, 'reply', i18n[ctx.session.lang].welcome + '\n' + i18n[ctx.session.lang].commands, {
    parse_mode: 'MarkdownV2',
    ...Markup.removeKeyboard()
  });
});

// Action handlers
bot.action(/DETAILS_(\d+)/, async ctx => {
  const folderId = ctx.match[1];
  const lang = ctx.session.lang || 'fa';
  try {
    const folder = await restrictAccess(ctx, folderId);
    await showFolderContent(ctx, folder);
  } catch (err) {
    await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
    console.error('Error in DETAILS action:', err);
  }
});

bot.action(/ADD_(\d+)/, async ctx => {
  const folderId = ctx.match[1];
  const lang = ctx.session.lang || 'fa';
  try {
    await restrictAccess(ctx, folderId);
    ctx.session.addFiles = { step: 'files', folder_id: folderId, files: [] };
    return ctx.scene.enter('ADD_FILES_SCENE');
  } catch (err) {
    await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
    console.error('Error in ADD action:', err);
  }
});

bot.action(/SHARE_(\d+)/, async ctx => {
  const lang = ctx.session.lang || 'fa';
  let conn;
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.execute('SELECT folder_name FROM folders WHERE id = ? AND chat_id = ?', [ctx.match[1], ctx.chat.id]);
    if (!rows.length) return replyAndDelete(ctx, 'reply', i18n[lang].folder_not_found, { parse_mode: 'MarkdownV2' });
    const shareText = `📁 Folder: ${escapeMarkdownV2(rows[0].folder_name)}\nBot: @${(await bot.telegram.getMe()).username}`;
    await replyAndDelete(ctx, 'reply', shareText, {
      parse_mode: 'MarkdownV2',
      ...Markup.inlineKeyboard([Markup.button.switchToCurrentChat('Share', shareText)])
    });
  } catch (err) {
    await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
    console.error('Error in SHARE action:', err);
  } finally {
    if (conn) conn.release();
  }
});

bot.action(/DELETE_(\d+)/, async ctx => {
  const lang = ctx.session.lang || 'fa';
  try {
    const folder = await restrictAccess(ctx, ctx.match[1]);
    if (folder.password) {
      ctx.session.folderToDelete = folder;
      return ctx.scene.enter('DELETE_PASSWORD_SCENE');
    }
    let conn;
    try {
      conn = await pool.getConnection();
      await conn.execute('DELETE FROM folder_files WHERE folder_id = ?', [folder.id]);
      await conn.execute('DELETE FROM folders WHERE id = ?', [folder.id]);
      const userDir = ensureUserDir(ctx.chat.id);
      const folderFiles = await fs.readdir(userDir);
      for (const file of folderFiles) {
        if (file.startsWith(`${folder.id}_`)) {
          await fs.unlink(path.join(userDir, file));
        }
      }
      await replyAndDelete(ctx, 'reply', i18n[lang].folder_deleted);
    } finally {
      if (conn) conn.release();
    }
  } catch (err) {
    await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
    console.error('Error in DELETE action:', err);
  }
});

bot.action(/EDIT_(\d+)/, async ctx => {
  const lang = ctx.session.lang || 'fa';
  try {
    const folder = await restrictAccess(ctx, ctx.match[1]);
    ctx.session.editFolder = { step: 'field', folder };
    return ctx.scene.enter('EDIT_FOLDER_SCENE');
  } catch (err) {
    await replyAndDelete(ctx, 'reply', i18n[lang].error_generic);
    console.error('Error in EDIT action:', err);
  }
});

// Error handling
bot.catch((err, ctx) => {
  console.error(`Error: ${err.message}`);
  replyAndDelete(ctx, 'reply', i18n[ctx.session.lang || 'fa'].error_generic);
});

// Cleanup on process termination
process.on('SIGINT', async () => {
  await pool.end();
  bot.stop('SIGINT');
  console.log('Database connections closed.');
});
process.on('SIGTERM', async () => {
  await pool.end();
  bot.stop('SIGTERM');
  console.log('Database connections closed.');
});

// Initialize database
const initDatabase = async () => {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS folders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        chat_id BIGINT NOT NULL,
        folder_name VARCHAR(255) NOT NULL,
        description TEXT,
        tags VARCHAR(255),
        password VARCHAR(255),
        cover_file_path VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(chat_id, folder_name),
        INDEX idx_chat_id (chat_id)
      )
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS folder_files (
        id INT AUTO_INCREMENT PRIMARY KEY,
        folder_id INT NOT NULL,
        file_path VARCHAR(255) NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        text_content TEXT,
        FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
        INDEX idx_folder_id (folder_id)
      )
    `);
    console.log('Database initialized.');
  } catch (err) {
    console.error('Error initializing database:', err.message);
    process.exit(1);
  } finally {
    if (conn) conn.release();
  }
};

// Initialize bot
const initialize = async () => {
  try {
    await setupBinaries();
    await initDatabase();
    await bot.launch();
    console.log('Bot started.');
  } catch (err) {
    console.error('Error starting bot:', err.message);
    process.exit(1);
  }
};

initialize();