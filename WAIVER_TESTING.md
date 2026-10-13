# Waiver System – How to Test (Dev)

This walks you through testing everything in the new waiver system on the **dev site** (or `http://localhost:3000`). Each test lists what to do and what you should see. Tick the box when it works. If something looks wrong, note the test number, take a screenshot, and send it over.

> **Not legal advice.** The waiver wording in `src/legal/waiver-documents.ts` is a draft for your lawyer to review before production.

---

## 0. Before you start

- [ ] **The dev database migration is done.** You already ran `database/waiver_v3_migration.sql` on the dev Supabase project (`qukbbuipylifmfzrjldg`). Do **not** run it on production yet.
- [ ] **Use the dev site, not production.** The dev site is the Vercel deployment of the `dev` branch.
- [ ] **Have a phone and a computer.** The signing screen is built for phones, so test at least once on a real phone.
- [ ] **Have your admin or staff login.** You need it for the scanner and the Admin → Members tab.
- [ ] **Know about the email limit.** Emails come from Resend's test sender (`onboarding@resend.dev`). Until you verify your own domain in Resend, emails **only reach the exact email address that owns the Resend account**. When a test asks you to "email a link", send it to that address. Signed-copy emails for other test accounts won't arrive yet. That's expected; everything else still works.
- [ ] **Use test accounts.** Use Gmail "plus" addresses to create as many test accounts as you need, e.g. `you+wendy@gmail.com`, `you+teen@gmail.com`. If you want to test the signed-copy email in section 1, use the Resend owner address for that one account.

**Everyone must re-sign.** All existing members get the new waiver popup and are blocked at the scanner until they sign. That is expected.

---

## 1. An adult signs their own waiver

1. Create a new account (☰ → **Create Account**) for an adult, e.g. "Wendy Tester", age 30. Sign in.
2. Go to **Dashboard**.

| ✓ | What you should see |
|---|---|
| [ ] | A full-screen popup opens by itself: **"Document 1 of 2 · Liability Waiver · For Wendy Tester"**. |
| [ ] | There is **no X** and **no "Not now"**. You can't skip your own waiver. |
| [ ] | The dashboard behind it is blurred. |

Next, **check the safety rules** (still on Document 1):

| ✓ | Try this | Expected |
|---|---|---|
| [ ] | Don't scroll. Look at the bottom of the popup. | Checkboxes, name and signature are greyed out. The popup says "Scroll through the whole document to continue." |
| [ ] | Scroll to the end of the document. | The form unlocks. Gray text says "To continue: initial 4 more sections, check 3 more boxes, …" |
| [ ] | Type initials in each yellow **"Initial here"** box (there are 4). | Each box turns green, and the counter shows **Initials: 4 of 4**. |
| [ ] | Type a **different person's name** (e.g. "Jane Smith"). | An amber warning: "This must be Wendy Tester's own legal name…". The button stays disabled. |
| [ ] | Type **Wendy Tester**, check all 3 boxes, and draw a signature with your finger or mouse. | The red button **"I Agree · Next: Photo & Video Release"** turns on. |

3. Click **I Agree · Next**.

| ✓ | What you should see |
|---|---|
| [ ] | **"Document 2 of 2 · Photo & Video Release"**. |
| [ ] | Clicking **← Back** returns to Document 1 with everything still filled in, including your drawn signature. Go forward again. |
| [ ] | Scroll to the end, initial the 1 box, and check the 3 boxes. At the bottom it says "Signing as Wendy Tester with the signature you drew", with your signature shown. |
| [ ] | Clicking **Adopt Signature & Sign** closes the popup. The dashboard is no longer blurred. |
| [ ] | Under **My Household**, Wendy shows a green **Waiver ✓**. |
| [ ] | A **"Your signed waiver for Wendy Tester"** email arrives. It contains the full text, the initials, a document fingerprint, and links to view the copy. This only works if Wendy's email is your Resend account email (see section 0). |

---

## 2. A parent signs for a child (under 18)

1. Still signed in as Wendy, go to **My Household → Add a Family Member**: "Kiddo Tester", born in 2016.

| ✓ | What you should see |
|---|---|
| [ ] | A popup opens for Kiddo: **"Minor Liability Waiver"**, with an amber badge **"UNDER 18 · PARENT/GUARDIAN SIGNS"**. |
| [ ] | There is **no "Not now"**. Wendy is the parent, so she signs now. |
| [ ] | The document includes **"Youth Concussion and Sudden Cardiac Arrest Information"** and has **5** initial boxes. |
| [ ] | There are 4 checkboxes, including "I reviewed the concussion and sudden cardiac arrest information with Kiddo". |
| [ ] | There is a field **"Kiddo, type your name to confirm…"**. Type "Kiddo Tester"; a parent can type it for a young child. |
| [ ] | You must choose **Parent** or **Legal Guardian** before you can continue. |
| [ ] | Any adult name is accepted here, because the parent signs with their own name. |
| [ ] | After the Photo & Video Release, the popup closes and Kiddo shows **Waiver ✓**. |
| [ ] | Click Kiddo's **Waiver ✓**. On the signed copy, **Valid until** is **one year from today** and **Relationship** is **Parent**. |

---

## 3. Another adult in the household (they must sign for themselves)

1. As Wendy, add a family member who is an adult, e.g. "Paula Tester", born in 1998.

| ✓ | What you should see |
|---|---|
| [ ] | A different popup: **"Paula needs to sign their own waiver"**. It explains that an adult has to sign their own waiver. |
| [ ] | It offers **"I'm Paula. Sign on this device"**, an **"Email Paula a link"** box, **Not now**, and an **X**. |
| [ ] | The dashboard behind it is **not** blurred, because Wendy can't fix this herself. |

**3a. Sign on this device (in-person hand-off)**

| ✓ | Try this | Expected |
|---|---|---|
| [ ] | Click **"I'm Paula. Sign on this device"**. | The signing screen opens for Paula. The name label reads "Paula, type your full legal name". |
| [ ] | Type **Wendy Tester** as the name. | An amber warning appears. Only Paula's name works. |
| [ ] | Finish signing as **Paula Tester**. | Paula shows **Waiver ✓**. Her signed copy says "Signed in person on the account holder's device". |

(To test 3b as well, add a second adult, e.g. "Pat Tester", and use them for 3b.)

**3b. Email link**

| ✓ | Try this | Expected |
|---|---|---|
| [ ] | In **Email … a link**, enter your Resend account email and click **Send**. | Green text: "Link sent to … It works for 7 days." |
| [ ] | Click **Done**. | The popup closes. Pat shows a red **"Waiver Missing · Sign"** badge. |
| [ ] | Reload the dashboard. | Pat's popup **doesn't** come back during this browser session. Wendy isn't nagged. |
| [ ] | Click Pat's red **· Sign** badge. | Pat's popup opens again. Close it. |
| [ ] | Open the email **"Please sign your gym waiver"** and click **Read & sign the waiver**. Use a phone or a private window; no login is needed. | The signing screen opens for Pat, with no "Not now". |
| [ ] | Sign as **Pat Tester**. | The **"All set!"** screen appears and a signed-copy email arrives. |
| [ ] | Open the same email link again. | The page says **"Already signed"**. A link only works once. |
| [ ] | Visit `/waiver/sign/abc123`. | The page says **"Link not found"**. |
| [ ] | Back on Wendy's dashboard. | Pat shows **Waiver ✓**. Pat's signed copy says "Signed through an emailed link". |

Rate limit: a member can send at most **5 links per person per day**. A sixth attempt shows "Too many links sent today."

---

## 4. A teenager with their own account

1. Sign out. Create an account for a 16-year-old, e.g. "Teen Tester", born in 2010.
2. Open the Dashboard.

| ✓ | What you should see |
|---|---|
| [ ] | The popup says **"A parent or guardian needs to sign for Teen"**. A teen can't sign their own waiver. |
| [ ] | The options are **"My parent or guardian is here"** (hand the phone over), **"Email a parent or guardian a link"**, and **Not now**. |
| [ ] | Use the hand-off option. The screen asks for **Parent / Legal Guardian** and the parent's name. Finish signing. |
| [ ] | The teen shows **Waiver ✓**. The signed copy says Relationship **Parent**, valid for **one year**. |

---

## 5. The front-desk scanner

Use your staff or admin login. Open **Admin → Check-in Scanner → Open kiosk**, or use **"Forgot their phone?"** to look someone up by name.

| ✓ | Try this | Expected |
|---|---|---|
| [ ] | Check in an **existing member who hasn't re-signed yet** (they need an active membership or day pass). | **Yellow "Waiver Required"** with the reason: "Our waiver was updated. They need to sign the new version in the app." |
| [ ] | Check in a brand-new member who hasn't signed. | **Yellow "Waiver Required"**: "No signed waiver on file…" |
| [ ] | Have that person sign on their phone, then check them in again. | **Green "Checked In"**. |
| [ ] | A day-pass holder who hasn't signed scans. | **Yellow "Waiver Required"**. The **day pass is not used up**: it is still under "Available Tickets" on their dashboard. |

You don't need to test these now, but the scanner also gives a specific message when a child's yearly waiver expires, or when a child turns 18 and has to sign the adult waiver.

---

## 6. Signed copies and privacy

| ✓ | Try this | Expected |
|---|---|---|
| [ ] | Click any **Waiver ✓** badge. | The **Signed copy** page shows the full text, "Initialed: XX" chips, the signature image, and a **Signature record**: who signed, relationship, method, time, valid until, version, fingerprint, IP address and device. |
| [ ] | Click **Print / Save PDF**. | A clean printable version without the buttons. |
| [ ] | Copy the signed-copy URL. Open it while **logged out**. | You are sent to the login page. |
| [ ] | Open the URL while logged in as a **different member** who isn't in that household. | **404 / not found**. Members can only see their own household's waivers. |
| [ ] | Open it as **staff or admin**. | It opens, because staff can see every waiver. |

---

## 7. Admin dashboard

| ✓ | Try this | Expected |
|---|---|---|
| [ ] | **Admin → Members**, look at the **Waiver** column. | Members who signed v3 show a green **✓ Signed**, which opens their signed copy in a new tab. |
| [ ] | Look at existing members who haven't re-signed. | **⚠ Update Needed**. |
| [ ] | Look at members who never signed. | **✗ Missing**. |
| [ ] | **Admin → User's Guide**, search "waiver". | The guide explains both documents, that adults sign for themselves, the email link, and yearly re-signing for kids. |

---

## 8. Phone check (do once on a real phone)

| ✓ | What you should see |
|---|---|
| [ ] | The popup fills the screen, and the text is easy to read without zooming. |
| [ ] | Drawing a signature with your finger works smoothly, and the page doesn't scroll while you draw. |
| [ ] | The initial boxes open the keyboard with capital letters. |
| [ ] | The buttons at the bottom are reachable and not hidden behind the phone's browser bar. |

---

## 9. Clean up after testing

Test accounts stay in the dev database. That's harmless on dev, but if you want them gone, tell me which emails you used and I'll remove them and everything attached to them.

---

## Going live (production) – in this order

1. Your lawyer reviews `src/legal/waiver-documents.ts`. Their checklist is at the top of that file, and it includes the exact registered business name (`LEGAL_ENTITY`).
2. If the wording changes, bump `DOCUMENT_VERSION` (e.g. `3.0` → `3.1`) so everyone signs the final text.
3. Verify your domain in Resend and change the sender in `src/utils/email.ts`, so emails reach members.
4. Run `database/waiver_v3_migration.sql` on the **production** Supabase project.
5. Merge `dev` → `main`.
6. Warn members (front-desk sign or text): *"We updated our waiver. Open the app and sign before your next visit."* Everyone will be asked to re-sign.

**Things the website can't do for you (California youth sports laws):**
- **Coach training:** concussion training for coaches (HSC §124235).
- **Nevaeh Act:** coaches need CPR/AED certification and a written cardiac emergency plan by **Jan 1, 2027**, and an AED on site by **Jan 1, 2028**.
- **AB 506 (protecting kids from abuse):** abuse-prevention training and Live Scan background checks for staff and volunteers who work with kids.
