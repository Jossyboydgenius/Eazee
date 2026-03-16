import { NextResponse } from 'next/server'

// In-memory job queue (replace with Redis/BullMQ for production)
const jobQueue: unknown[] = []

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      caption, postType, brief, tone, photos,
      hasCeloPayment, price, currency,
      waAccount, sendTime, repeat, targets, groups
    } = body

    if (!caption || !waAccount || !sendTime || !targets?.length) {
      return NextResponse.json({ error: 'Missing required scheduling fields' }, { status: 400 })
    }

    const job = {
      id: `job-${Date.now()}`,
      caption,
      postType,
      brief,
      tone,
      photos: photos || [],
      hasCeloPayment,
      price,
      currency,
      waAccount,
      sendTime,
      repeat,
      targets,
      groups: groups || [],
      status: 'queued',
      scheduledFor: buildScheduledDate(sendTime),
      createdAt: new Date().toISOString(),
    }

    // In MVP: just store in memory. In production: add to BullMQ/Redis
    jobQueue.push(job)

    console.log(`✅ Scheduled job ${job.id} for ${job.scheduledFor}`)

    return NextResponse.json({
      success: true,
      jobId: job.id,
      scheduledFor: job.scheduledFor,
      message: `Post scheduled for ${sendTime} (${repeat})`,
    })
  } catch (error) {
    console.error('Scheduling error:', error)
    return NextResponse.json({ error: 'Failed to schedule post' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ queue: jobQueue, count: jobQueue.length })
}

function buildScheduledDate(sendTime: string): string {
  // If it looks like a datetime-local string, use it directly
  if (sendTime.includes('T')) return sendTime

  // If it's a time like "17:00" schedule for today at that time
  const [hours] = sendTime.split(':')
  const now = new Date()
  now.setHours(parseInt(hours), 0, 0, 0)

  // If the time has passed today, schedule for tomorrow
  if (now.getTime() < Date.now()) {
    now.setDate(now.getDate() + 1)
  }

  return now.toISOString()
}
