import { verifySignature } from '@upstash/qstash/nextjs';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import type { NextApiRequest, NextApiResponse } from 'next';

import { DeadlineExceededbyWeekTemplate } from '@/components/emails/deadlineExceededbyWeekTemplate';
import { prisma } from '@/prisma';
import { rateLimitedPromiseAll } from '@/utils/rateLimitedPromises';
import resendMail from '@/utils/resend';

dayjs.extend(utc);

async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const sevenDaysAgo = dayjs().subtract(7, 'day').toISOString();

    const bounties = await prisma.bounties.findMany({
      where: {
        isPublished: true,
        isActive: true,
        isArchived: false,
        status: 'OPEN',
        deadline: {
          lt: sevenDaysAgo,
        },
        isWinnersAnnounced: false,
      },
      include: {
        sponsor: {
          select: {
            UserSponsors: {
              select: {
                user: {
                  select: {
                    email: true,
                    firstName: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const emailPromises = bounties.map(async (bounty) => {
      const checkLogs = await prisma.emailLogs.findFirst({
        where: {
          bountyId: bounty.id,
          type: 'BOUNTY_DEADLINE_WEEK',
        },
      });

      if (checkLogs) {
        return null;
      }

      const sponsorEmail = bounty.sponsor?.UserSponsors[0]?.user?.email;
      const sponsorFirstName = bounty.sponsor?.UserSponsors[0]?.user?.firstName;

      if (!sponsorEmail || !sponsorFirstName) {
        return null;
      }

      await resendMail.emails.send({
        from: `Kash from Superteam <${process.env.SENDGRID_EMAIL}>`,
        to: [sponsorEmail],
        bcc: ['pratik.dholani1@gmail.com'],
        subject: 'Winner Announcement for Your Earn Bounty Is Due!',
        react: DeadlineExceededbyWeekTemplate({
          name: sponsorFirstName,
          bountyName: bounty.title,
          link: `https://earn.superteam.fun/listings/bounties/${
            bounty?.slug || ''
          }/?utm_source=superteamearn&utm_medium=email&utm_campaign=notifications`,
        }),
      });

      await prisma.emailLogs.create({
        data: {
          type: 'BOUNTY_DEADLINE_WEEK',
          bountyId: bounty.id,
        },
      });
      return bounty.id;
    });

    const emailResults = await rateLimitedPromiseAll(
      emailPromises,
      9,
      (emailPromise) => emailPromise
    );

    const sentBountyIds = emailResults.filter(
      (sentBountyId) => sentBountyId !== null
    );

    if (sentBountyIds.length > 0) {
      console.log('Sent emails for bounties:', sentBountyIds);
    }

    return res.status(200).json({ message: 'Ok' });
  } catch (e) {
    console.error(e);
    return res
      .status(500)
      .json({ error: 'Something went wrong. Check server logs for details.' });
  }
}

export default verifySignature(handler);

export const config = {
  api: {
    bodyParser: false,
  },
};
