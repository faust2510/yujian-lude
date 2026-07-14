import nodemailer from 'nodemailer';
import { config } from '../config.js';

export class MailUnavailableError extends Error {
  constructor(message = '邮件服务未配置') {
    super(message);
    this.name = 'MailUnavailableError';
  }
}

function accountLink(publicAppUrl, pathname, token) {
  const url = new URL(pathname, `${publicAppUrl.replace(/\/$/, '')}/`);
  url.searchParams.set('token', token);
  return url.toString();
}

function messageHtml({ title, intro, action, link, note }) {
  return `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;background:#fff9fa;color:#31282b;font-family:Arial,'PingFang SC',sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:40px 24px">
      <p style="margin:0 0 24px;color:#a75c70;font-size:20px;font-weight:700">遇见路得</p>
      <h1 style="margin:0 0 16px;font-size:26px">${title}</h1>
      <p style="margin:0 0 24px;line-height:1.7">${intro}</p>
      <p style="margin:0 0 24px">
        <a href="${link}" style="display:inline-block;padding:12px 20px;background:#c96f82;color:#fff;text-decoration:none;border-radius:6px">${action}</a>
      </p>
      <p style="margin:0;color:#74676b;font-size:13px;line-height:1.6">${note}</p>
    </div>
  </body>
</html>`;
}

export function createMailService({
  mailConfig = config.mail,
  publicAppUrl = config.publicAppUrl,
  createTransport = nodemailer.createTransport,
} = {}) {
  let transport;

  function getTransport() {
    if (!mailConfig?.enabled) throw new MailUnavailableError();
    if (!transport) {
      const options = {
        host: mailConfig.host,
        port: mailConfig.port,
        secure: mailConfig.secure,
      };
      if (mailConfig.user && mailConfig.pass) {
        options.auth = { user: mailConfig.user, pass: mailConfig.pass };
      }
      transport = createTransport(options);
    }
    return transport;
  }

  async function send({ to, subject, text, html }) {
    return getTransport().sendMail({ from: mailConfig.from, to, subject, text, html });
  }

  return {
    async sendVerificationEmail({ to, token }) {
      const link = accountLink(publicAppUrl, '/app/verify-email', token);
      return send({
        to,
        subject: '遇见路得：验证邮箱',
        text: `请打开下面的链接验证邮箱：\n${link}\n\n该链接将在 24 小时后失效。若非本人操作，请忽略此邮件。`,
        html: messageHtml({
          title: '验证你的邮箱',
          intro: '完成邮箱验证后，你的账户会更安全，并可继续完善遇见路得的信任资料。',
          action: '验证邮箱',
          link,
          note: '该链接将在 24 小时后失效。若非本人操作，请忽略此邮件。',
        }),
      });
    },

    async sendPasswordResetEmail({ to, token }) {
      const link = accountLink(publicAppUrl, '/app/reset-password', token);
      return send({
        to,
        subject: '遇见路得：重置密码',
        text: `请打开下面的链接重置密码：\n${link}\n\n该链接将在 1 小时后失效。若非本人操作，请忽略此邮件。`,
        html: messageHtml({
          title: '重置密码',
          intro: '我们收到了你的密码重置请求。点击下面的按钮设置新密码。',
          action: '重置密码',
          link,
          note: '该链接将在 1 小时后失效。若非本人操作，请忽略此邮件。',
        }),
      });
    },
  };
}

export const accountMail = createMailService();
