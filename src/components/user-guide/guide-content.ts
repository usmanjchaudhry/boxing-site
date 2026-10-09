import {
  Compass, ScanLine, Palette, Snowflake, UserPlus, Users, Ticket, KeyRound, Banknote, LifeBuoy,
  type LucideIcon,
} from 'lucide-react'
import type { AdminTab, StaffRole } from '@/app/admin/admin-tabs'
import type { GuideFacts } from '@/utils/user-guide-facts'

/**
 * Content of the staff User's Guide, as plain data.
 *
 * Kept separate from the UI (UserGuideTab) so wording can change without
 * touching layout code. Text may wrap on-screen words in **double stars**;
 * the UI shows those as button-style labels so staff know exactly what to tap.
 *
 * Content is built per role: staff never see admin-only steps.
 */

export interface GuideLink {
  label: string
  /** Switch to another admin tab. */
  tab?: AdminTab
  /** Open a page of the site in a new browser tab. */
  href?: string
}

export interface GuideStep {
  text: string
  detail?: string
  link?: GuideLink
}

export type GuideBlock =
  | { type: 'text'; text: string }
  | { type: 'steps'; title?: string; steps: GuideStep[] }
  | { type: 'note'; tone: 'tip' | 'warning' | 'info'; text: string }
  | { type: 'tabs' }          // what each admin tab is for (from ADMIN_TABS)
  | { type: 'scanResults' }   // scanner colors and what to do (from the scanner's own rules)
  | { type: 'prices' }        // live plans and prices (from the database)
  | { type: 'legacyCode' }    // reveal/copy the Legacy code
  | { type: 'faq'; items: { q: string; a: string }[] }

export interface GuideSection {
  id: string
  title: string
  summary: string
  icon: LucideIcon
  adminOnly?: boolean
  /** Extra words people might search for. */
  keywords?: string
  blocks: GuideBlock[]
}

export const SITE_URL = 'lafamiliashowtimeboxing.com'

export function buildGuide(role: StaffRole, facts: GuideFacts): GuideSection[] {
  const isAdmin = role === 'admin'
  const individual = facts.plans.find(p => p.individual)
  const family = facts.plans.find(p => !p.individual)
  const passPrice = facts.dayPass?.price ?? 'the day pass price'

  const sections: GuideSection[] = [
    /* ───────────── Getting around ───────────── */
    {
      id: 'getting-around',
      title: 'Getting around the website',
      summary: isAdmin
        ? 'How to open the Admin Dashboard and what every tab does.'
        : 'How to open the Staff tools and what each tab does.',
      icon: Compass,
      keywords: 'navigate menu admin dashboard tabs sign in log in sign out',
      blocks: [
        {
          type: 'steps',
          title: 'Open the Admin Dashboard',
          steps: [
            { text: `Go to **${SITE_URL}** and sign in with your own email and password.` },
            {
              text: 'On a computer: click the purple **Admin** button at the top of the page.',
              detail: 'On a phone: tap the ☰ menu in the top-right corner, then tap **Admin Dashboard**.',
            },
            { text: 'You are now on the Admin Dashboard. The row of buttons near the top are the tabs.' },
          ],
        },
        {
          type: 'note',
          tone: 'info',
          text: isAdmin
            ? 'You are an **Admin**, so you see every tab and can freeze, cancel, and change roles.'
            : 'You are **Staff**, so you see the tabs you need for the front desk. Money tabs, freezing, and cancelling are for admins only.',
        },
        { type: 'tabs' },
        {
          type: 'steps',
          title: 'Good to know',
          steps: [
            { text: 'The page updates itself every 15 seconds. Tap **Refresh** (top right) to update it right now.' },
            { text: 'To go to your own member page, tap **Dashboard** at the top.' },
            { text: 'To sign out on a computer, click the door icon at the top right. On a phone, open the ☰ menu and tap **Sign Out**.' },
          ],
        },
      ],
    },

    /* ───────────── Check-in ───────────── */
    {
      id: 'check-in',
      title: 'Checking in customers',
      summary: 'Set up the scanner, scan QR codes, and check in someone who forgot their phone.',
      icon: ScanLine,
      keywords: 'scan scanner qr code kiosk front desk check in forgot phone manual',
      blocks: [
        {
          type: 'steps',
          title: '1. Get the scanner ready (do this once when you open)',
          steps: [
            { text: 'On the front-desk computer, open the **Check-in Scanner** tab.', link: { label: 'Open Check-in Scanner', tab: 'checkin' } },
            {
              text: 'Click the red **Open kiosk ↗** button. This opens a clean, full-screen check-in page.',
              detail: 'The kiosk is best for the front desk because nothing else on the page can get in the way of the scanner.',
              link: { label: 'Open kiosk', href: '/checkin' },
            },
            {
              text: 'Click once anywhere on the page. The badge at the top should turn green and say **Scanner ready**.',
              detail: 'If it says **Click here to activate scanner**, click it. The scanner only works while this page is the one you last clicked on.',
            },
            { text: 'Click **Click to enable sound** so you hear a beep for every scan.' },
          ],
        },
        {
          type: 'steps',
          title: '2. Check someone in',
          steps: [
            {
              text: `The customer opens **${SITE_URL}** on their phone, signs in, and taps **Dashboard**.`,
              detail: 'Their QR code is under **Gym Check-in QR Codes**. Family members each have their own code on the same page.',
            },
            { text: 'They turn their screen brightness up and hold the QR code 4–8 inches from the scanner.' },
            { text: 'Look at the screen. **Green** means let them in. **Yellow** or **red** means stop and read the message.' },
            { text: 'The screen clears by itself after a few seconds. Or tap **Next member**.' },
          ],
        },
        {
          type: 'steps',
          title: 'Forgot their phone?',
          steps: [
            { text: 'On the scanner page, find the box called **Forgot their phone?** on the right.' },
            { text: 'Type at least 2 letters of their name.' },
            { text: 'Tap their name in the list. It checks them in the same way as a scan.' },
          ],
        },
        {
          type: 'note',
          tone: 'tip',
          text: 'A day pass is used up automatically when the person scans. You don\u2019t need to do anything else. One day pass = one visit.',
        },
        {
          type: 'note',
          tone: 'info',
          text: 'Want to see who came in today? Open the **Check-ins** tab.',
        },
      ],
    },

    /* ───────────── Scan colors ───────────── */
    {
      id: 'scan-results',
      title: 'What the scan colors mean',
      summary: 'Every message the scanner can show, and exactly what to do.',
      icon: Palette,
      keywords: 'green yellow red denied waiver payment due frozen cancelled day pass used limit expired error',
      blocks: [
        {
          type: 'text',
          text: '**Green** = let them in. **Yellow** = they can fix it right now (for example, sign the waiver), then scan again. **Red** = do not let them in yet.',
        },
        { type: 'scanResults' },
      ],
    },

    /* ───────────── Freeze ───────────── */
    isAdmin
      ? {
          id: 'freeze',
          title: 'Freezing or unfreezing a membership',
          summary: 'Pause a membership (no charges, no entry) and turn it back on.',
          icon: Snowflake,
          adminOnly: true,
          keywords: 'freeze pause hold vacation injury unfreeze resume cancel',
          blocks: [
            {
              type: 'text',
              text: 'Freezing pauses a membership. While it is frozen, the customer is **not charged** and their QR code **will not let them in**.',
            },
            {
              type: 'steps',
              title: 'Freeze a membership',
              steps: [
                { text: 'Open the **Members** tab.', link: { label: 'Open Members', tab: 'members' } },
                { text: 'Type the customer\u2019s name in **Search by name...**' },
                {
                  text: 'Find the person whose row says **Primary** (the account holder). Click the blue **Freeze** button on that row.',
                  detail: 'Buttons only show on the account holder\u2019s row. If you see \u201cDependent of\u201d under a name, search for that account holder instead.',
                },
                {
                  text: 'Choose how long:',
                  detail: 'Pick a date and time, then click **Freeze Until Selected Time**. It turns back on by itself at that time.\nOr click **Freeze Indefinitely**. It stays frozen until you unfreeze it.',
                },
                { text: 'The status changes to **Frozen**. Done.' },
              ],
            },
            {
              type: 'steps',
              title: 'Unfreeze a membership',
              steps: [
                { text: 'Open the **Members** tab and search for the account holder.', link: { label: 'Open Members', tab: 'members' } },
                { text: 'Click the green **Unfreeze** button, then **Yes, Unfreeze Now**.' },
                { text: 'They can check in right away, and billing starts again.' },
              ],
            },
            {
              type: 'note',
              tone: 'warning',
              text: 'Freezing only works for memberships paid by card on the website. **Cancel** (the red button) ends a membership for good and they lose access right away, so only use it when the customer is sure.',
            },
          ],
        }
      : {
          id: 'freeze',
          title: 'Freezing a membership',
          summary: 'Who can freeze, and what to tell the customer.',
          icon: Snowflake,
          keywords: 'freeze pause hold vacation injury unfreeze resume cancel',
          blocks: [
            {
              type: 'note',
              tone: 'info',
              text: 'Only an **Admin** can freeze, unfreeze, or cancel a membership. Staff can\u2019t, so the buttons don\u2019t appear for you.',
            },
            {
              type: 'steps',
              title: 'When a customer asks to freeze',
              steps: [
                { text: 'Write down their full name and how long they want to freeze (or \u201cuntil further notice\u201d).' },
                { text: 'Send it to the owner or an admin. They will freeze it.' },
                { text: 'Let the customer know: while frozen, they are **not charged** and their QR code **won\u2019t let them in**.' },
              ],
            },
            {
              type: 'steps',
              title: 'Check if someone is frozen',
              steps: [
                { text: 'Open the **Members** tab and search their name.', link: { label: 'Open Members', tab: 'members' } },
                { text: 'Look at the **Subscription** column. It says **Frozen** if the membership is paused.' },
              ],
            },
          ],
        },

    /* ───────────── Sign up + buy ───────────── */
    {
      id: 'sign-up',
      title: 'Helping a customer sign up and buy a membership',
      summary: 'Create their account and pay on their own phone, step by step.',
      icon: UserPlus,
      keywords: 'sign up register create account new member buy subscribe membership pay card waiver',
      blocks: [
        { type: 'note', tone: 'tip', text: 'Do this on the **customer\u2019s phone**, so the account and the card are theirs.' },
        {
          type: 'steps',
          title: '1. Create their account',
          steps: [
            { text: `Open **${SITE_URL}** on their phone.` },
            { text: 'Tap the ☰ menu (top right), then **Create Account**.', detail: 'On a computer: click **Get Started**, then **Create an Account**.' },
            { text: 'Fill in first name, last name, email, phone number, date of birth, and a password (twice).' },
            { text: 'Tap **Create Account**, then **Okay**. They are now signed in.' },
          ],
        },
        {
          type: 'steps',
          title: '2. Sign the waiver',
          steps: [
            { text: 'Tap the ☰ menu, then **Dashboard**.' },
            { text: 'The waiver pops up the first time. They read it, sign with their finger, and submit.', detail: 'They can\u2019t check in without a signed waiver.' },
          ],
        },
        {
          type: 'steps',
          title: '3. Buy the membership',
          steps: [
            { text: 'On the Dashboard, tap the red **View Memberships** button.', link: { label: 'See the Memberships page', href: '/memberships' } },
            {
              text: 'Pick a plan and tap **Subscribe**.',
              detail: [
                individual ? `${individual.name} (${individual.price}/month) is just for them.` : '',
                family ? `${family.name} (${family.price}/month) is mostly for a parent and their kid, or two kids. If they\u2019re only buying for one kid, the ${individual?.name ?? 'individual plan'} is enough.` : '',
              ].filter(Boolean).join('\n'),
            },
            { text: 'A secure payment page opens. They type their card details and tap **Subscribe**.' },
            { text: 'They see **You\u2019re All Set!** Tap **Go to Dashboard**. The membership shows green, and their QR code is ready to scan.' },
          ],
        },
        { type: 'prices' },
        {
          type: 'note',
          tone: 'warning',
          text: 'If they already have a membership, **don\u2019t buy a second one**. That charges them twice. To switch plans, ask the owner.',
        },
      ],
    },

    /* ───────────── Family ───────────── */
    {
      id: 'family',
      title: 'Family members: memberships and day passes',
      summary: 'Add kids or a partner to an account, cover them with a membership, or buy them a day pass.',
      icon: Users,
      keywords: 'family kids child children son daughter wife husband partner household dependent double add member day pass for',
      blocks: [
        {
          type: 'text',
          text: 'Family members are added to the **account holder\u2019s** account (usually a parent). They don\u2019t need their own email. Each person gets their own QR code.',
        },
        {
          type: 'steps',
          title: '1. Add a family member',
          steps: [
            { text: 'The account holder signs in on their phone and taps **Dashboard**.' },
            { text: 'Scroll to **My Household**, then **Add a Family Member**.' },
            { text: 'Type their first name, last name, and date of birth. Tap **Add to Household**.' },
            { text: 'A waiver pops up for the new person. The account holder (parent or guardian) signs it for them.' },
            { text: 'Their QR code now shows under **Gym Check-in QR Codes** on the account holder\u2019s Dashboard.' },
          ],
        },
        {
          type: 'steps',
          title: '2. Cover them with a membership',
          steps: [
            family
              ? {
                  text: `The account holder buys the **${family.name}** (${family.price}/month) from **View Memberships**.`,
                  detail: family.peoplePerDay
                    ? `It lets in up to ${family.peoplePerDay} people from the account each day.`
                    : 'It covers everyone on the account.',
                }
              : { text: 'The account holder buys a family plan from **View Memberships**.' },
            ...(individual
              ? [{
                  text: `The **${family?.name ?? 'family plan'}** is mostly for a parent and their kid, or two kids. If the parent is only buying for **one kid**, they can buy the **${individual.name}** instead.`,
                  detail: `The ${individual.name} covers only the person whose account it\u2019s bought on, so buy it on the kid\u2019s own account (sign the kid up with their own email, see \u201cHelping a customer sign up\u201d).`,
                }]
              : []),
            { text: 'Each family member scans their **own** QR code at the front desk.' },
          ],
        },
        {
          type: 'steps',
          title: '3. Or buy a family member a day pass',
          steps: [
            { text: 'The account holder taps **View Memberships** and scrolls down to **Single Passes**.' },
            { text: 'Under **Who is this pass for?**, they pick the family member.', detail: 'This choice only shows once someone has been added to the account.' },
            { text: 'Tap **Buy Pass for [name]** and pay.' },
            { text: 'The family member scans their own QR code. The pass is used up on that visit.' },
          ],
        },
        {
          type: 'note',
          tone: 'tip',
          text: 'An adult family member who wants to pay for themselves can create their own account instead (see \u201cHelping a customer sign up\u201d).',
        },
      ],
    },

    /* ───────────── Day pass ───────────── */
    {
      id: 'day-pass',
      title: 'Buying a day pass',
      summary: `A one-visit pass for ${passPrice}. Good for drop-ins and guests.`,
      icon: Ticket,
      keywords: 'day pass drop in guest visitor single visit one time ticket',
      blocks: [
        {
          type: 'steps',
          steps: [
            { text: 'The customer needs an account first. If they don\u2019t have one, follow \u201cHelping a customer sign up\u201d (steps 1 and 2).' },
            { text: 'On their Dashboard, tap **View Memberships** and scroll down to **Single Passes**.', link: { label: 'See the Memberships page', href: '/memberships' } },
            { text: `Tap **Buy Pass** (${passPrice}) and pay with their card.` },
            { text: 'The pass shows under **Available Tickets** on their Dashboard. They scan their QR code like normal.' },
          ],
        },
        {
          type: 'note',
          tone: 'info',
          text: 'One day pass = **one visit**. If they leave and come back, they need another pass. If they bought two passes, the second one is used on the next scan.',
        },
      ],
    },

    /* ───────────── Legacy ───────────── */
    {
      id: 'legacy',
      title: `Legacy ${facts.legacy?.price ?? '$100'} plan (members from the old gym)`,
      summary: 'Unlock the hidden Legacy plan with the access code.',
      icon: KeyRound,
      keywords: 'legacy old gym transfer classified portal secret code hidden 100',
      blocks: [
        {
          type: 'note',
          tone: 'warning',
          text: 'Only for members who trained at the **old gym**. The plan is hidden from everyone else. Please don\u2019t share the code.',
        },
        { type: 'legacyCode' },
        {
          type: 'steps',
          title: 'Unlock and buy the Legacy plan',
          steps: [
            { text: 'On the customer\u2019s phone, sign in to their account (or create one first). Make sure the waiver is signed.' },
            { text: 'Tap **Dashboard**, then the red **View Memberships** button.', link: { label: 'See the Memberships page', href: '/memberships' } },
            {
              text: 'Scroll all the way to the **bottom** of the page. Tap the small grey text **[ CLASSIFIED PORTAL ]**.',
              detail: 'It is small and easy to miss. It\u2019s under the line that starts \u201cAll plans are billed monthly\u201d.',
            },
            { text: 'Type the access code (above) and tap **Unlock Plan**.' },
            { text: `The **${facts.legacy?.name ?? 'Legacy Unlimited'}** plan appears (${facts.legacy?.price ?? '$100'}/month). Tap **Subscribe**.` },
            { text: 'Enter their card on the payment page and tap **Subscribe**. Then tap **Go to Dashboard**. Their QR code is ready.' },
          ],
        },
        {
          type: 'note',
          tone: 'tip',
          text: `The unlock lasts ${facts.legacy?.unlockMinutes ?? 60} minutes. If the page jumps back to the normal plans, just enter the code again. The Legacy plan covers the account holder only.`,
        },
      ],
    },
  ]

  /* ───────────── Cash (admin only) ───────────── */
  if (isAdmin) {
    sections.push({
      id: 'cash',
      title: 'Recording a cash payment',
      summary: 'Turn on a membership for someone who paid in cash.',
      icon: Banknote,
      adminOnly: true,
      keywords: 'cash money paid in person activate renew',
      blocks: [
        {
          type: 'steps',
          steps: [
            { text: 'The customer needs an account first (see \u201cHelping a customer sign up\u201d).' },
            { text: 'Open the **Cash Payments** tab.', link: { label: 'Open Cash Payments', tab: 'cash' } },
            { text: 'In **Member**, type their name and pick them from the list.' },
            { text: 'Choose the **Plan** and the **Payment Date**. Add a note if you like.', detail: 'The amount fills in with the plan price. If they paid a different amount, type what they actually paid. The plan still decides how long the membership lasts.' },
            { text: 'Click **Record Payment & Activate**. Their membership turns on, and the end date is worked out for you.' },
          ],
        },
        { type: 'note', tone: 'info', text: 'Cash memberships end on their own when the time runs out. The scanner will say **Membership Expired**. Record a new cash payment to renew.' },
        {
          type: 'steps',
          title: 'Recorded a payment twice by mistake?',
          steps: [
            { text: 'Open the **Cash Payments** tab and scroll to **Cash Payment History**.', link: { label: 'Open Cash Payments', tab: 'cash' } },
            { text: 'Double entries are marked **Possible duplicate**. Find the extra one.' },
            { text: 'Click **Remove** on that row, then **Yes, Remove Payment**.', detail: 'This only deletes the payment record. The membership stays on. To turn a membership off, use **Cancel** on the Members tab.' },
          ],
        },
      ],
    })
  }

  /* ───────────── Problems ───────────── */
  sections.push({
    id: 'problems',
    title: 'Common problems',
    summary: 'Quick fixes for the things that come up most.',
    icon: LifeBuoy,
    keywords: 'help problem issue not working forgot password scanner broken qr missing payment failed',
    blocks: [
      {
        type: 'faq',
        items: [
          { q: 'The scanner doesn\u2019t react when someone scans.', a: 'Click once on the scanner page so the badge says **Scanner ready**. Check the computer is online. Ask them to turn up their screen brightness.' },
          { q: 'The customer forgot their password.', a: 'On the sign-in page, tap **Forgot password?** and enter their email. They get a link to make a new one.' },
          { q: 'They can\u2019t find their QR code.', a: 'Sign in, tap **Dashboard**, and scroll to **Gym Check-in QR Codes**. If a waiver pops up first, it must be signed before they can scan.' },
          { q: 'The scanner says \u201cPayment Due\u201d.', a: 'Their card was declined, so they can\u2019t check in on the membership until it\u2019s fixed. Ask the owner to help them update their card. They can buy a day pass to train today.' },
          { q: 'The scanner says \u201cWaiver Required\u201d.', a: 'They open their Dashboard and sign the waiver that pops up, then scan again.' },
          { q: 'A family member can\u2019t get in on the membership.', a: 'Check their plan covers family (see \u201cFamily members\u201d). If not, they can buy a day pass for that person.' },
        ],
      },
    ],
  })

  return sections
}

/** Messages the scanner can show, in the order the guide lists them. */
export const SCAN_RESULTS: { flag: string; status: 'allowed' | 'denied' | 'error'; meaning: string; action?: string }[] = [
  { flag: 'Checked In', status: 'allowed', meaning: 'Everything is good.', action: 'Let them in.' },
  { flag: 'Waiver Required', status: 'denied', meaning: 'They haven\u2019t signed the waiver.' },
  { flag: 'Payment Due', status: 'denied', meaning: 'Their last card payment failed.' },
  { flag: 'Membership Expired', status: 'denied', meaning: 'Their cash membership has run out.' },
  { flag: 'Daily Limit Reached', status: 'denied', meaning: 'Their family plan has already let in the most people allowed today.' },
  { flag: 'Membership Frozen', status: 'denied', meaning: 'Their membership is paused.' },
  { flag: 'Membership Cancelled', status: 'denied', meaning: 'Their membership was cancelled.' },
  { flag: 'Day Pass Used', status: 'denied', meaning: 'Their day pass was already used today.' },
  { flag: 'No Active Pass', status: 'denied', meaning: 'They have no membership and no day pass.' },
  { flag: 'Not Found', status: 'error', meaning: 'The QR code doesn\u2019t belong to any member.', action: 'Ask them to sign in and show the code from their Dashboard.' },
  { flag: 'Unreadable Code', status: 'error', meaning: 'That isn\u2019t one of our QR codes.', action: 'Make sure they\u2019re showing the code from their Dashboard, not a screenshot of something else.' },
  { flag: 'Connection Problem', status: 'error', meaning: 'The computer couldn\u2019t reach the internet.', action: 'Check the Wi-Fi, then scan again.' },
]
