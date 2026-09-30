import { Resend } from 'resend'

// Initialize Resend with the API key from environment variables
const resend = new Resend(process.env.RESEND_API_KEY)

// 'onboarding@resend.dev' is a sandbox domain that lets you test emails to yourself.
// Once you register a domain, you can change this to 'hello@lafamiliaboxing.com'
const FROM_EMAIL = 'La Familia Boxing <onboarding@resend.dev>'

// A helper function to wrap emails in a sleek, dark-mode Boxing Gym design
function wrapEmailHtml(content: string) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #000; color: #fff; padding: 20px; border-radius: 10px; border: 1px solid #333;">
      <h1 style="color: #dc2626; text-transform: uppercase; font-style: italic; letter-spacing: -1px; margin-bottom: 5px;">La Familia</h1>
      <h3 style="color: #666; margin-top: 0; text-transform: uppercase; font-size: 12px; letter-spacing: 2px;">Showtime Boxing Club</h3>
      
      <div style="background-color: #111; padding: 20px; border-radius: 8px; border: 1px solid #222; margin-top: 30px;">
        ${content}
      </div>
      
      <p style="color: #555; font-size: 11px; margin-top: 40px; text-align: center;">
        See you at the gym.<br/>
        La Familia Showtime Boxing Club
      </p>
    </div>
  `
}

export async function sendGymEmail(to: string, subject: string, htmlContent: string) {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.log('No RESEND_API_KEY found, skipping email:', subject)
      return
    }
    const data = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: wrapEmailHtml(htmlContent),
    })
    console.log('Email sent to:', to, data)
  } catch (error) {
    console.error('Failed to send email:', error)
  }
}
