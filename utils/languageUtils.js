/**
 * Language Translation Utility
 * Provides multi-language support for error and success messages
 * Supports Arabic (ar), English (en), and Hebrew (he) with Arabic as default
 */

const translations = {
  // Authentication and Login Messages
  PHONE_EMAIL_REQUIRED: {
    ar: 'رقم الهاتف أو البريد الإلكتروني مطلوب',
    en: 'Phone number or email is required',
    he: 'נדרש מספר טלפון או כתובת אימייל'
  },
  LOGGED_OUT_SUCCESS: {
    ar: 'تم تسجيل الخروج بنجاح',
    en: 'Logged out successfully',
    he: 'התנתקת בהצלחה'
  },

  // Email Verification Messages
  VERIFICATION_TOKEN_REQUIRED: {
    ar: 'رمز التحقق مطلوب',
    en: 'Verification token is required',
    he: 'נדרש אסימון אימות'
  },
  EMAIL_VERIFIED_SUCCESS: {
    ar: 'تم التحقق من البريد الإلكتروني بنجاح! مرحباً بك في منصتنا.',
    en: 'Email verified successfully! Welcome to our platform.',
    he: 'האימייל אומת בהצלחה! ברוכים הבאים לפלטפורמה שלנו.'
  },
  EMAIL_REQUIRED: {
    ar: 'عنوان البريد الإلكتروني مطلوب',
    en: 'Email address is required',
    he: 'נדרשת כתובת אימייל'
  },
  VERIFICATION_EMAIL_SENT: {
    ar: 'تم إرسال بريد التحقق بنجاح. يرجى التحقق من صندوق الوارد.',
    en: 'Verification email sent successfully. Please check your inbox.',
    he: 'אימייל האימות נשלח בהצלחה. אנא בדקו את תיבת הדואר הנכנס.'
  },
  VERIFICATION_EMAIL_FAILED: {
    ar: 'فشل في إرسال بريد التحقق. يرجى المحاولة مرة أخرى لاحقاً.',
    en: 'Failed to send verification email. Please try again later.',
    he: 'שליחת אימייל האימות נכשלה. אנא נסו שוב מאוחר יותר.'
  },

  // Email Validation Messages
  INVALID_EMAIL: {
    ar: 'يرجى إدخال عنوان بريد إلكتروني صحيح',
    en: 'Please enter a valid email address',
    he: 'אנא הזינו כתובת אימייל תקינה'
  },

  // Password Reset Messages
  PASSWORD_RESET_CODE_SENT: {
    ar: 'تم إرسال رمز التحقق إلى عنوان بريدك الإلكتروني. يرجى التحقق من صندوق الوارد وإدخال الرمز لإعادة تعيين كلمة المرور.',
    en: 'A verification code has been sent to your email address. Please check your inbox and enter the code to reset your password.',
    he: 'קוד אימות נשלח לכתובת האימייל שלכם. אנא בדקו את תיבת הדואר הנכנס והזינו את הקוד כדי לאפס את הסיסמה.'
  },
  PASSWORD_RESET_CODE_FAILED: {
    ar: 'فشل في إرسال رمز التحقق. يرجى المحاولة مرة أخرى لاحقاً.',
    en: 'Failed to send verification code. Please try again later.',
    he: 'שליחת קוד האימות נכשלה. אנא נסו שוב מאוחר יותר.'
  },
  EMAIL_CODE_REQUIRED: {
    ar: 'البريد الإلكتروني ورمز التحقق مطلوبان',
    en: 'Email and verification code are required',
    he: 'נדרשים אימייל וקוד אימות'
  },
  INVALID_VERIFICATION_CODE: {
    ar: 'رمز التحقق يجب أن يكون 6 أرقام',
    en: 'Verification code must be 6 digits',
    he: 'קוד האימות חייב להיות בן 6 ספרות'
  },
  VERIFICATION_CODE_VALID: {
    ar: 'رمز التحقق صحيح. يمكنك الآن تعيين كلمة مرور جديدة.',
    en: 'Verification code is valid. You can now set a new password.',
    he: 'קוד האימות תקין. כעת תוכלו להגדיר סיסמה חדשה.'
  },
  EMAIL_CODE_PASSWORD_REQUIRED: {
    ar: 'البريد الإلكتروني ورمز التحقق وكلمة المرور الجديدة مطلوبة',
    en: 'Email, verification code, and new password are required',
    he: 'נדרשים אימייל, קוד אימות וסיסמה חדשה'
  },
  PASSWORD_MIN_LENGTH: {
    ar: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
    en: 'Password must be at least 6 characters long',
    he: 'הסיסמה חייבת להיות באורך של לפחות 6 תווים'
  },
  PASSWORD_RESET_SUCCESS: {
    ar: 'تم إعادة تعيين كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.',
    en: 'Password has been reset successfully. You can now log in with your new password.',
    he: 'הסיסמה אופסה בהצלחה. כעת תוכלו להתחבר עם הסיסמה החדשה.'
  },
  PASSWORD_RESET_FAILED: {
    ar: 'فشل في إعادة تعيين كلمة المرور. يرجى المحاولة مرة أخرى.',
    en: 'Failed to reset password. Please try again.',
    he: 'איפוס הסיסמה נכשל. אנא נסו שוב.'
  },

  // File Upload Messages
  NO_IMAGE_PROVIDED: {
    ar: 'لم يتم توفير ملف صورة',
    en: 'No image file provided',
    he: 'לא סופק קובץ תמונה'
  },
  UPLOAD_FAILED: {
    ar: 'فشل في رفع صورة الملف الشخصي',
    en: 'Failed to upload profile image',
    he: 'העלאת תמונת הפרופיל נכשלה'
  },
  USER_CREATED: {
    ar: 'تم إنشاء المستخدم بنجاح',
    en: 'User created successfully',
    he: 'המשתמש נוצר בהצלחה'
  },
  USER_UPDATED: {
    ar: 'تم تحديث المستخدم بنجاح',
    en: 'User updated successfully',
    he: 'המשתמש עודכן בהצלחה'
  },
  NO_IMAGE_PROVIDED: {
    ar: 'لم يتم توفير ملف صورة',
    en: 'No image file provided',
    he: 'לא סופק קובץ תמונה'
  },
  PROFILE_IMAGE_UPDATED: {
    ar: 'تم تحديث الصورة الشخصية بنجاح',
    en: 'Profile image updated successfully',
    he: 'תמונת הפרופיל עודכנה בהצלחה'
  }
};

/**
 * Get translated message based on language preference
 * @param {string} key - Message key from translations object
 * @param {string} language - Language code (ar, en, he)
 * @returns {string} Translated message
 */
function getMessage(key, language = 'ar') {
  // Validate language parameter
  const supportedLanguages = ['ar', 'en', 'he'];
  const lang = supportedLanguages.includes(language) ? language : 'ar';
  
  // Get translation or fallback to Arabic, then English
  if (translations[key]) {
    return translations[key][lang] || translations[key]['ar'] || translations[key]['en'] || key;
  }
  
  // Return key if translation not found
  console.warn(`Translation not found for key: ${key}`);
  return key;
}

/**
 * Get language from request (query, body, or headers)
 * @param {Object} req - Express request object
 * @returns {string} Language code
 */
function getLanguageFromRequest(req) {
  // Check query parameters first
  if (req.query && req.query.language) {
    return req.query.language;
  }
  
  // Check request body
  if (req.body && req.body.language) {
    return req.body.language;
  }
  
  // Check Accept-Language header
  if (req.headers && req.headers['accept-language']) {
    const acceptLanguage = req.headers['accept-language'].toLowerCase();
    if (acceptLanguage.includes('ar')) return 'ar';
    if (acceptLanguage.includes('he')) return 'he';
    if (acceptLanguage.includes('en')) return 'en';
  }
  
  // Default to Arabic
  return 'ar';
}

/**
 * Create a response with translated message
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} status - Response status (success/error)
 * @param {string} messageKey - Message key for translation
 * @param {string} language - Language code
 * @param {Object} data - Additional data to include in response
 * @returns {Object} Express response
 */
function sendResponse(res, statusCode, status, messageKey, language = 'ar', data = null) {
  const response = {
    status,
    message: getMessage(messageKey, language)
  };
  
  if (data) {
    response.data = data;
  }
  
  return res.status(statusCode).json(response);
}

module.exports = {
  getMessage,
  getLanguageFromRequest,
  sendResponse,
  translations
};