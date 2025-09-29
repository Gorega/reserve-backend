const nodemailer = require('nodemailer');
const crypto = require('crypto');

/**
 * Email Service Utility
 * Handles all email operations including verification emails
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
    this.translations = this.initializeTranslations();
  }

  /**
   * Initialize translations for different languages
   */
  initializeTranslations() {
    return {
      en: {
        verifyEmail: {
          subject: 'Verify Your Email Address - Click App',
          title: 'Verify Your Email Address',
          greeting: 'Hello',
          welcome: 'Welcome to Click App! We\'re excited to have you on board. To complete your registration and start using our platform, please verify your email address by clicking the button below:',
          buttonText: 'Verify Email Address',
          securityNote: '🔒 Security Note:',
          securityText: 'This verification link will expire in 24 hours for your security. If you didn\'t create an account with Click App, please ignore this email.',
          alternativeText: 'If the button above doesn\'t work, you can copy and paste the following link into your browser:',
          onceVerified: 'Once verified, you\'ll be able to:',
          features: [
            '✅ Access all platform features',
            '✅ Make reservations',
            '✅ Receive important notifications'
          ],
          support: 'If you have any questions or need assistance, feel free to contact our support team.',
          regards: 'Best regards,',
          team: 'The Click App Team',
          footerText: 'This email was sent to verify your account registration. If you didn\'t sign up for Click App, please ignore this email.',
          copyright: '© 2025 Click App. All rights reserved.'
        },
        welcome: {
          subject: '🎉 Welcome to Click App - Account Verified!',
          title: '🎉 Welcome to Click App!',
          greeting: 'Hello',
          congratulations: 'Congratulations! Your email has been successfully verified and your Click App account is now active.',
          enjoy: 'You can now enjoy all the features our platform has to offer. Start exploring and make the most of your Click App experience!',
          buttonText: 'Start Exploring',
          thanks: 'Thank you for joining our community!',
          regards: 'Best regards,',
          team: 'The Click App Team',
          copyright: '© 2025 Click App. All rights reserved.'
        },
        passwordReset: {
          subject: 'Reset Your Password - Click App',
          title: 'Reset Your Password',
          greeting: 'Hello',
          message: 'We received a request to reset your password. Click the button below to create a new password:',
          button: 'Reset Password',
          ignore: 'If you didn\'t request this password reset, please ignore this email.',
          regards: 'Best regards,',
          team: 'The Click App Team',
          rights: 'All rights reserved.'
        }
      },
      ar: {
        verifyEmail: {
          subject: 'تأكيد عنوان البريد الإلكتروني - كليك',
          title: 'تأكيد عنوان البريد الإلكتروني',
          greeting: 'مرحباً',
          welcome: 'مرحباً بك في كليك! نحن متحمسون لانضمامك إلينا. لإكمال تسجيلك وبدء استخدام منصتنا، يرجى تأكيد عنوان بريدك الإلكتروني بالنقر على الزر أدناه:',
          buttonText: 'تأكيد البريد الإلكتروني',
          securityNote: '🔒 ملاحظة أمنية:',
          securityText: 'ستنتهي صلاحية رابط التأكيد هذا خلال 24 ساعة لأمانك. إذا لم تقم بإنشاء حساب في كليك، يرجى تجاهل هذا البريد الإلكتروني.',
          alternativeText: 'إذا لم يعمل الزر أعلاه، يمكنك نسخ ولصق الرابط التالي في متصفحك:',
          onceVerified: 'بمجرد التأكيد، ستتمكن من:',
          features: [
            '✅ الوصول إلى جميع ميزات المنصة',
            '✅ إجراء الحجوزات',
            '✅ تلقي الإشعارات المهمة'
          ],
          support: 'إذا كان لديك أي أسئلة أو تحتاج إلى مساعدة، لا تتردد في الاتصال بفريق الدعم لدينا.',
          regards: 'أطيب التحيات،',
          team: 'فريق تطبيق كليك',
          footerText: 'تم إرسال هذا البريد الإلكتروني لتأكيد تسجيل حسابك. إذا لم تقم بالتسجيل في تطبيق كليك، يرجى تجاهل هذا البريد الإلكتروني.',
          copyright: '© 2025 تطبيق كليك. جميع الحقوق محفوظة.'
        },
        welcome: {
          subject: '🎉 مرحباً بك في كليك - تم تأكيد الحساب!',
          title: '🎉 مرحباً بك في كليك!',
          greeting: 'مرحباً',
          congratulations: 'تهانينا! تم تأكيد بريدك الإلكتروني بنجاح وأصبح حسابك في كليك نشطاً الآن.',
          enjoy: 'يمكنك الآن الاستمتاع بجميع الميزات التي تقدمها منصتنا. ابدأ في الاستكشاف واستفد من تجربة كليك!',
          buttonText: 'ابدأ الاستكشاف',
          thanks: 'شكراً لانضمامك إلى مجتمعنا!',
          regards: 'أطيب التحيات،',
          team: 'فريق كليك',
          copyright: '© 2025 كليك. جميع الحقوق محفوظة.'
        },
        passwordReset: {
          subject: 'إعادة تعيين كلمة المرور - تطبيق كليك',
          title: 'إعادة تعيين كلمة المرور',
          greeting: 'مرحباً',
          message: 'تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بك. انقر على الزر أدناه لإنشاء كلمة مرور جديدة:',
          button: 'إعادة تعيين كلمة المرور',
          ignore: 'إذا لم تطلب إعادة تعيين كلمة المرور هذه، يرجى تجاهل هذا البريد الإلكتروني.',
          regards: 'مع أطيب التحيات،',
          team: 'فريق كليك',
          rights: 'جميع الحقوق محفوظة.'
        }
      },
      he: {
        verifyEmail: {
          subject: 'אמת את כתובת האימייל שלך - אפליקציית קליק',
          title: 'אמת את כתובת האימייל שלך',
          greeting: 'שלום',
          welcome: 'ברוכים הבאים לאפליקציית קליק! אנחנו נרגשים שהצטרפתם אלינו. כדי להשלים את ההרשמה ולהתחיל להשתמש בפלטפורמה שלנו, אנא אמתו את כתובת האימייל שלכם על ידי לחיצה על הכפתור למטה:',
          buttonText: 'אמת כתובת אימייל',
          securityNote: '🔒 הערת אבטחה:',
          securityText: 'קישור האימות הזה יפוג תוך 24 שעות לביטחונכם. אם לא יצרתם חשבון באפליקציית קליק, אנא התעלמו מהאימייל הזה.',
          alternativeText: 'אם הכפתור למעלה לא עובד, תוכלו להעתיק ולהדביק את הקישור הבא בדפדפן שלכם:',
          onceVerified: 'לאחר האימות, תוכלו:',
          features: [
            '✅ לגשת לכל תכונות הפלטפורמה',
            '✅ לבצע הזמנות',
            '✅ לקבל התראות חשובות'
          ],
          support: 'אם יש לכם שאלות או אתם זקוקים לעזרה, אל תהססו לפנות לצוות התמיכה שלנו.',
          regards: 'בברכה,',
          team: 'צוות אפליקציית קליק',
          footerText: 'האימייל הזה נשלח כדי לאמת את רישום החשבון שלכם. אם לא נרשמתם לאפליקציית קליק, אנא התעלמו מהאימייל הזה.',
          copyright: '© 2025 אפליקציית קליק. כל הזכויות שמורות.'
        },
        welcome: {
          subject: '🎉 ברוכים הבאים לאפליקציית קליק - החשבון אומת!',
          title: '🎉 ברוכים הבאים לאפליקציית קליק!',
          greeting: 'שלום',
          congratulations: 'מזל טוב! האימייל שלכם אומת בהצלחה וחשבון אפליקציית קליק שלכם פעיל כעת.',
          enjoy: 'כעת תוכלו ליהנות מכל התכונות שהפלטפורמה שלנו מציעה. התחילו לחקור והפיקו את המרב מחוויית אפליקציית קליק שלכם!',
          buttonText: 'התחל לחקור',
          thanks: 'תודה שהצטרפתם לקהילה שלנו!',
          regards: 'בברכה,',
          team: 'צוות אפליקציית קליק',
          copyright: '© 2025 אפליקציית קליק. כל הזכויות שמורות.'
        },
        passwordReset: {
          subject: 'איפוס סיסמה - אפליקציית קליק',
          title: 'איפוס סיסמה',
          greeting: 'שלום',
          message: 'קיבלנו בקשה לאיפוס הסיסמה שלכם. לחצו על הכפתור למטה כדי ליצור סיסמה חדשה:',
          button: 'איפוס סיסמה',
          ignore: 'אם לא ביקשתם איפוס סיסמה זה, אנא התעלמו מהאימייל הזה.',
          regards: 'בברכה,',
          team: 'צוות אפליקציית קליק',
          rights: 'כל הזכויות שמורות.'
        }
      }
    };
  }

  /**
   * Initialize email transporter
   */
  initializeTransporter() {
    try {
      this.transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || 'gmail',
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT) || 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      // Verify connection configuration
      this.transporter.verify((error, success) => {
        if (error) {
          console.error('Email service configuration error:', error);
        } else {
          console.log('Email service is ready to send messages');
        }
      });
    } catch (error) {
      console.error('Failed to initialize email transporter:', error);
    }
  }

  /**
   * Generate verification token
   * @returns {string} - Verification token
   */
  generateVerificationToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate verification URL
   * @param {string} token - Verification token
   * @returns {string} - Verification URL
   */
  generateVerificationUrl(token) {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    return `${baseUrl}/auth/verify-email?token=${token}`;
  }

  /**
   * Create verification email HTML template
   * @param {string} userName - User's name
   * @param {string} verificationUrl - Verification URL
   * @param {string} language - Language code (ar, en, he)
   * @returns {string} - HTML email template
   */
  createVerificationEmailTemplate(userName, verificationUrl, language = 'ar') {
    const t = this.translations[language] || this.translations['ar'];
    const isRTL = language === 'ar' || language === 'he';
    const dir = isRTL ? 'rtl' : 'ltr';
    const textAlign = isRTL ? 'right' : 'left';
    
    return `
    <!DOCTYPE html>
    <html lang="${language}" dir="${dir}">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${t.verifyEmail.title} - Click App</title>
        <style>
            body {
                font-family: ${isRTL ? "'Segoe UI', 'Tahoma', 'Arial', sans-serif" : "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"};
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f4f4f4;
                direction: ${dir};
                text-align: ${textAlign};
            }
            .container {
                background: white;
                padding: 40px;
                border-radius: 10px;
                box-shadow: 0 0 20px rgba(0,0,0,0.1);
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
            }
            .logo {
                font-size: 28px;
                font-weight: bold;
                color: #FF5A5F;
                margin-bottom: 10px;
            }
            .title {
                color: #222;
                font-size: 24px;
                margin-bottom: 20px;
            }
            .content {
                margin-bottom: 30px;
                font-size: 16px;
                line-height: 1.8;
                text-align: ${textAlign};
            }
            .verify-button {
                display: inline-block;
                background-color: #FF5A5F;
                color: white;
                padding: 15px 30px;
                text-decoration: none;
                border-radius: 8px;
                font-weight: bold;
                font-size: 16px;
                margin: 20px 0;
                transition: background-color 0.3s;
            }
            .verify-button:hover {
                background-color: #E04E53;
            }
            .alternative-link {
                background-color: #f8f9fa;
                padding: 15px;
                border-radius: 5px;
                margin: 20px 0;
                word-break: break-all;
                font-size: 14px;
                color: #666;
                direction: ltr;
                text-align: left;
            }
            .footer {
                margin-top: 40px;
                padding-top: 20px;
                border-top: 1px solid #eee;
                font-size: 14px;
                color: #666;
                text-align: center;
            }
            .security-note {
                background-color: #fff3cd;
                border: 1px solid #ffeaa7;
                padding: 15px;
                border-radius: 5px;
                margin: 20px 0;
                font-size: 14px;
            }
            .features-list {
                text-align: ${textAlign};
                padding-${isRTL ? 'right' : 'left'}: 20px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">Click App</div>
                <h1 class="title">${t.verifyEmail.title}</h1>
            </div>
            
            <div class="content">
                <p>${t.verifyEmail.greeting} <strong>${userName}</strong>,</p>
                
                <p>${t.verifyEmail.welcome}</p>
                
                <div style="text-align: center;">
                    <a href="${verificationUrl}" class="verify-button">${t.verifyEmail.buttonText}</a>
                </div>
                
                <div class="security-note">
                    <strong>${t.verifyEmail.securityNote}</strong> ${t.verifyEmail.securityText}
                </div>
                
                <p>${t.verifyEmail.alternativeText}</p>
                
                <div class="alternative-link">
                    ${verificationUrl}
                </div>
                
                <p>${t.verifyEmail.onceVerified}</p>
                <ul class="features-list">${t.verifyEmail.features.map(feature => `<li>${feature}</li>`).join('')}</ul>
                
                <p>${t.verifyEmail.support}</p>
                
                <p>${t.verifyEmail.regards}<br>${t.verifyEmail.team}</p>
            </div>
            
            <div class="footer">
                <p>${t.verifyEmail.footerText}</p>
                <p>${t.verifyEmail.copyright}</p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  /**
   * Send verification email
   * @param {string} email - Recipient email
   * @param {string} userName - User's name
   * @param {string} verificationToken - Verification token
   * @param {string} language - Language code (ar, en, he)
   * @returns {Promise<boolean>} - Success status
   */
  async sendVerificationEmail(email, userName, verificationToken, language = 'ar') {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const verificationUrl = this.generateVerificationUrl(verificationToken);
      const htmlContent = this.createVerificationEmailTemplate(userName, verificationUrl, language);
      const t = this.translations[language] || this.translations['ar'];

      const mailOptions = {
        from: {
          name: process.env.EMAIL_FROM_NAME || 'Click App',
          address: process.env.EMAIL_FROM || process.env.EMAIL_USER
        },
        to: email,
        subject: t.verifyEmail.subject,
        html: htmlContent,
        text: `${t.verifyEmail.greeting} ${userName},\n\n${t.verifyEmail.welcome}\n\n${verificationUrl}\n\n${t.verifyEmail.securityText}\n\n${t.verifyEmail.regards}\n${t.verifyEmail.team}`
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('Verification email sent successfully:', result.messageId);
      return true;
    } catch (error) {
      console.error('Error sending verification email:', error);
      return false;
    }
  }

  /**
   * Create welcome email HTML template
   * @param {string} userName - User's name
   * @param {string} language - Language code (ar, en, he)
   * @returns {string} - HTML email template
   */
  createWelcomeEmailTemplate(userName, language = 'ar') {
    const t = this.translations[language] || this.translations['ar'];
    const isRTL = language === 'ar' || language === 'he';
    const dir = isRTL ? 'rtl' : 'ltr';
    const textAlign = isRTL ? 'right' : 'left';
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    
    return `
    <!DOCTYPE html>
    <html lang="${language}" dir="${dir}">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${t.welcome.title} - Click App</title>
        <style>
            body {
                font-family: ${isRTL ? "'Segoe UI', 'Tahoma', 'Arial', sans-serif" : "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"};
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f4f4f4;
                direction: ${dir};
                text-align: ${textAlign};
            }
            .container {
                background: white;
                padding: 40px;
                border-radius: 10px;
                box-shadow: 0 0 20px rgba(0,0,0,0.1);
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
            }
            .logo {
                font-size: 28px;
                font-weight: bold;
                color: #FF5A5F;
                margin-bottom: 10px;
            }
            .title {
                color: #222;
                font-size: 24px;
                margin-bottom: 20px;
            }
            .content {
                margin-bottom: 30px;
                font-size: 16px;
                line-height: 1.8;
                text-align: ${textAlign};
            }
            .explore-button {
                display: inline-block;
                background-color: #FF5A5F;
                color: white;
                padding: 15px 30px;
                text-decoration: none;
                border-radius: 8px;
                font-weight: bold;
                font-size: 16px;
                margin: 20px 0;
                transition: background-color 0.3s;
            }
            .explore-button:hover {
                background-color: #E04E53;
            }
            .footer {
                margin-top: 40px;
                padding-top: 20px;
                border-top: 1px solid #eee;
                font-size: 14px;
                color: #666;
                text-align: center;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">Click App</div>
                <h1 class="title">${t.welcome.title}</h1>
            </div>
            
            <div class="content">
                <p>${t.welcome.greeting} <strong>${userName}</strong>,</p>
                
                <p>${t.welcome.congratulations}</p>
                
                <p>${t.welcome.enjoy}</p>
                
                <div style="text-align: center;">
                    <a href="${baseUrl}" class="explore-button">${t.welcome.buttonText}</a>
                </div>
                
                <p>${t.welcome.thanks}</p>
                
                <p>${t.welcome.regards}<br>${t.welcome.team}</p>
            </div>
            
            <div class="footer">
                <p>${t.welcome.copyright}</p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  /**
   * Send welcome email after verification
   * @param {string} email - Recipient email
   * @param {string} userName - User's name
   * @param {string} language - Language code (ar, en, he)
   * @returns {Promise<boolean>} - Success status
   */
  async sendWelcomeEmail(email, userName, language = 'ar') {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const htmlContent = this.createWelcomeEmailTemplate(userName, language);
      const t = this.translations[language] || this.translations['ar'];

      const mailOptions = {
        from: {
          name: process.env.EMAIL_FROM_NAME || 'Click App',
          address: process.env.EMAIL_FROM || process.env.EMAIL_USER
        },
        to: email,
        subject: t.welcome.subject,
        html: htmlContent,
        text: `${t.welcome.greeting} ${userName},\n\n${t.welcome.congratulations}\n\n${t.welcome.enjoy}\n\n${t.welcome.thanks}\n\n${t.welcome.regards}\n${t.welcome.team}`
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('Welcome email sent successfully:', result.messageId);
      return true;
    } catch (error) {
      console.error('Error sending welcome email:', error);
      return false;
    }
  }

  /**
   * Create password reset email template
   * @param {string} userName - User's name
   * @param {string} resetUrl - Password reset URL
   * @param {string} language - Language code (ar, en, he)
   * @returns {string} - HTML email template
   */
  createPasswordResetEmailTemplate(userName, resetUrl, language = 'ar') {
    const translations = this.translations[language] || this.translations['ar'];
    const isRTL = language === 'ar' || language === 'he';
    
    return `
    <!DOCTYPE html>
    <html lang="${language}" dir="${isRTL ? 'rtl' : 'ltr'}">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${translations.passwordReset.title}</title>
        <style>
            body {
                font-family: ${isRTL ? "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" : "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"};
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f4f4f4;
                direction: ${isRTL ? 'rtl' : 'ltr'};
            }
            .container {
                background: white;
                padding: 40px;
                border-radius: 10px;
                box-shadow: 0 0 20px rgba(0,0,0,0.1);
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
            }
            .logo {
                font-size: 28px;
                font-weight: bold;
                color: #FF5A5F;
                margin-bottom: 10px;
            }
            .title {
                color: #222;
                font-size: 24px;
                margin-bottom: 20px;
            }
            .content {
                margin-bottom: 30px;
                font-size: 16px;
                line-height: 1.8;
                text-align: ${isRTL ? 'right' : 'left'};
            }
            .reset-button {
                display: inline-block;
                background-color: #FF5A5F;
                color: white;
                padding: 15px 30px;
                text-decoration: none;
                border-radius: 8px;
                font-weight: bold;
                font-size: 16px;
                margin: 20px 0;
            }
            .footer {
                margin-top: 40px;
                padding-top: 20px;
                border-top: 1px solid #eee;
                font-size: 14px;
                color: #666;
                text-align: center;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">Click App</div>
                <h1 class="title">${translations.passwordReset.title}</h1>
            </div>
            
            <div class="content">
                <p>${translations.passwordReset.greeting} <strong>${userName}</strong>,</p>
                
                <p>${translations.passwordReset.message}</p>
                
                <div style="text-align: center;">
                    <a href="${resetUrl}" class="reset-button">${translations.passwordReset.button}</a>
                </div>
                
                <p>${translations.passwordReset.ignore}</p>
                
                <p>${translations.passwordReset.regards}<br>${translations.passwordReset.team}</p>
            </div>
            
            <div class="footer">
                <p>&copy; 2025 Click. ${translations.passwordReset.rights}</p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  /**
   * Send password reset email
   * @param {string} email - Recipient email
   * @param {string} userName - User's name
   * @param {string} resetToken - Password reset token
   * @param {string} language - Language code (ar, en, he)
   * @returns {Promise<boolean>} - Success status
   */
  async sendPasswordResetEmail(email, userName, resetToken, language = 'ar') {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const resetUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/auth/reset-password?token=${resetToken}`;
      const translations = this.translations[language] || this.translations['ar'];
      
      const htmlContent = this.createPasswordResetEmailTemplate(userName, resetUrl, language);

      const mailOptions = {
        from: {
          name: process.env.EMAIL_FROM_NAME || 'Click App',
          address: process.env.EMAIL_FROM || process.env.EMAIL_USER
        },
        to: email,
        subject: translations.passwordReset.subject,
        html: htmlContent,
        text: `${translations.passwordReset.greeting} ${userName},\n\n${translations.passwordReset.message}\n\n${resetUrl}\n\n${translations.passwordReset.ignore}\n\n${translations.passwordReset.regards}\n${translations.passwordReset.team}`
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('Password reset email sent successfully:', result.messageId);
      return true;
    } catch (error) {
      console.error('Error sending password reset email:', error);
      return false;
    }
  }
}

// Create and export singleton instance
const emailService = new EmailService();
module.exports = emailService;