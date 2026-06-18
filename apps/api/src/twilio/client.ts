import twilio from 'twilio'

export const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!,
)

export async function sendReply(to: string, body: string): Promise<void> {
  await twilioClient.messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER!,
    to,
    body,
  })
}
