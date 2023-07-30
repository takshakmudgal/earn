import type { NextApiRequest, NextApiResponse } from 'next';

import { SubmissionSponsorTemplate } from '@/components/emails/submissionSponsorTemplate';
import { SubmissionTemplate } from '@/components/emails/submissionTemplate';
import { prisma } from '@/prisma';
import resendMail from '@/utils/resend';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { listingId, userId } = req.body;
  try {
    const listing = await prisma.bounties.findFirst({
      where: {
        id: listingId as string,
      },
      include: {
        sponsor: {
          include: {
            UserSponsors: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });
    const user = await prisma.user.findFirst({
      where: {
        id: userId as string,
      },
    });
    if (user?.email && user?.firstName && listing?.title) {
      await resendMail.emails.send({
        from: `Kash from Superteam <${process.env.SENDGRID_EMAIL}>`,
        to: [user?.email],
        subject: 'Submission Received!',
        react: SubmissionTemplate({
          name: user?.firstName,
          bountyName: listing?.title,
        }),
      });
    }

    if (
      user?.email &&
      listing?.sponsor.UserSponsors[0]?.user.email &&
      listing?.title &&
      listing?.sponsor.UserSponsors[0]?.user.firstName
    ) {
      await resendMail.emails.send({
        from: `Kash from Superteam <${process.env.SENDGRID_EMAIL}>`,
        to: [listing?.sponsor.UserSponsors[0]?.user.email],
        subject: 'New Bounty Submission Received',
        react: SubmissionSponsorTemplate({
          name: listing?.sponsor.UserSponsors[0]?.user.firstName,
          bountyName: listing?.title,
          link: `https://earn.superteam.fun/listings/bounties/${listing?.slug}/?utm_source=superteamearn&utm_medium=email&utm_campaign=notifications`,
        }),
      });
    }

    return res.status(200).json({ message: 'Ok' });
  } catch (error: any) {
    console.log(error);
    return res
      .status(500)
      .json({ error: `Something went wrong. ${error.message}` });
  }
}
