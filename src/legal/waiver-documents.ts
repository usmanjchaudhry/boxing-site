/**
 * WAIVER DOCUMENTS (source of truth)
 * ──────────────────────────────────────────────────────────────────────────
 * DRAFT FOR ATTORNEY REVIEW. Not legal advice.
 *
 * HOW TO CHANGE THE TEXT
 *   1. Edit the document below.
 *   2. Bump DOCUMENT_VERSION (e.g. '3.0' -> '3.1').
 *   3. Deploy. The app creates a new waiver_templates row for the new version
 *      and every member is asked to sign it again. The scanner shows
 *      "Waiver Required" until they do.
 *   If the text changes but the version doesn't, signing stops with an error,
 *   so a signed record can never point at text the member didn't see.
 *
 * FORMAT (kept simple so a lawyer can read it as plain text)
 *   # Title           ## Section heading        - Bullet point
 *   **bold**          blank line = new paragraph
 *   [[initial:key]]   the signer must initial here
 *
 * ITEMS FOR THE ATTORNEY TO CONFIRM
 *   - LEGAL_ENTITY: exact registered business name (LLC / corp / DBA).
 *   - Whether the landlord / property owner should be a Released Party.
 *   - Parent indemnity for a minor's own claims (Minor §11). California courts
 *     look at these skeptically. Keep, narrow, or remove.
 *   - Whether to add an arbitration clause. A pre-dispute JURY waiver is void
 *     in CA (Grafton Partners v. Superior Court, 2005), so none is included.
 *   - Civil Code §1542 waiver wording and placement.
 *   - Youth concussion / cardiac section vs. current Health & Safety Code
 *     §124235 requirements and the CDPH information sheet.
 *   - Media release scope, duration, and the takedown commitment.
 *   - Membership terms (Civil Code §1812.80+ and the automatic renewal law)
 *     are NOT covered here and should be reviewed separately.
 */

import { SITE } from '@/utils/site'

/** TODO(attorney): confirm the exact registered name, e.g. "La Familia Showtime Boxing Club LLC". */
export const LEGAL_ENTITY = 'La Familia Showtime Boxing Club'

export const DOCUMENT_VERSION = '3.0'
export const EFFECTIVE_DATE = '2026-10-13'

/** Minor liability waivers (and the concussion / cardiac sheet inside them) must be re-signed yearly. */
export const MINOR_WAIVER_VALID_DAYS = 365

export type WaiverKind = 'liability' | 'media'
export type WaiverAudience = 'adult' | 'minor' | 'all'

export interface WaiverDocument {
  kind: WaiverKind
  audience: WaiverAudience
  version: string
  title: string
  /** Short name used in buttons and emails. */
  shortName: string
  body: string
}

const ADDRESS = `${SITE.address.street}, ${SITE.address.city}, ${SITE.address.region} ${SITE.address.postalCode}`

const GYM = `${LEGAL_ENTITY}, doing business as ${SITE.name}, located at ${ADDRESS} (the **"Gym"**)`

const RELEASED_PARTIES =
  'the Gym and its owners, members, managers, officers, employees, coaches, trainers, independent contractors, volunteers, agents, successors and assigns, and the owner and landlord of the premises (together, the **"Released Parties"**)'

const ACTIVITIES =
  'every activity at the Gym or sponsored by the Gym, including boxing instruction, group classes, personal training, conditioning, heavy bag, speed bag and double-end bag work, pad and mitt work, partner drills, technical sparring, sparring, competition preparation, use of any equipment, restrooms, changing areas and parking areas, and Gym events held on or off site, whether or not supervised and **whether or not I am using exercise equipment** (together, the **"Activities"**)'

const RISK_LIST = `- **Blows to the head and body**, including concussion, traumatic brain injury, bleeding in or around the brain, loss of consciousness, and repeated smaller (sub-concussive) impacts that may add up over time.
- **Long-term brain injury**, including chronic traumatic encephalopathy (CTE), memory loss, headaches, mood and behavior changes, and other lasting neurological problems.
- **Eye, face and dental injuries**, including detached retina, loss of vision, broken nose, broken jaw or facial bones, cuts, scarring, and broken or lost teeth.
- **Bone, joint and muscle injuries**, including fractures, dislocations, sprains, strains, torn ligaments and tendons, and neck, back and spinal injuries that may cause paralysis.
- **Heart and heat-related events**, including heart attack, sudden cardiac arrest, stroke, fainting, heat exhaustion, heat stroke, dehydration, and rhabdomyolysis (severe muscle breakdown).
- **Contact with blood, sweat and other bodily fluids**, and skin infections or communicable illnesses (for example staph, MRSA, ringworm, colds and flu).
- **Slips, trips and falls** on floors, mats and stairs, and equipment that breaks, moves, falls or is used incorrectly.
- **The actions of other people**, including other members, sparring partners, guests and staff, whether careless, mistaken or intentional.
- **Instruction, supervision, first aid or emergency response** that turns out to be inadequate, mistaken or delayed.
- **Aggravation of any existing medical condition**, and other risks that are unknown or not reasonably foreseeable today.
- **Permanent disability and DEATH.**`

const FILMING_CODE = `- **Never** record, photograph or livestream in restrooms, changing areas or any place where people undress. This is a crime in California (Penal Code §647(j)) and will be reported.
- Film only yourself, or people who have agreed to be filmed.
- Do not single out, focus on or post close-ups of other members, **especially children**, without their permission (a parent's permission for a child).
- Do not film youth classes unless you are filming your own child, and do not feature other identifiable children.
- Stop filming when staff or the person being filmed asks you to, and delete content when staff ask.
- Keep tripods, lights and phones out of walkways and training areas.
- Do not post content that mocks, harasses or embarrasses another member.`

const ESIGN = `I agree to sign this agreement electronically. My electronic signature and typed name have the same legal effect as a handwritten signature under the California Uniform Electronic Transactions Act (Civil Code §1633.1 and following) and the federal E-SIGN Act. I can view, print and download a copy of what I signed at any time from my account or from the copy emailed to me, and I can ask the Gym for a paper copy.`

const SECTION_1542 = `I understand California Civil Code §1542, which says: **"A GENERAL RELEASE DOES NOT EXTEND TO CLAIMS THAT THE CREDITOR OR RELEASING PARTY DOES NOT KNOW OR SUSPECT TO EXIST IN HIS OR HER FAVOR AT THE TIME OF EXECUTING THE RELEASE AND THAT, IF KNOWN BY HIM OR HER, WOULD HAVE MATERIALLY AFFECTED HIS OR HER SETTLEMENT WITH THE DEBTOR OR RELEASED PARTY."** To the extent §1542 applies to the claims released in this agreement, I knowingly waive it, understanding that the release covers future injuries I cannot know about today.`

const NOT_RELEASED = `This agreement does **not** release any Released Party from liability for its **gross negligence, willful or intentional misconduct, fraud, or violation of law**, or for any other claim that cannot be released under California law (including Civil Code §1668). Everything else in this agreement still applies.`

const LAW_AND_SEVERABILITY = `California law governs this agreement. Any lawsuit about it or about the Activities must be filed in the state or federal courts for Los Angeles County, California. This agreement is meant to be as broad and inclusive as California law allows. If any part of it is found unenforceable, that part will be enforced to the greatest extent allowed, and the rest of the agreement stays in full effect. Section headings are for convenience only. This agreement is separate from, and in addition to, any membership agreement.`

// ─────────────────────────────────────────────────────────────────────────
// 1. ADULT LIABILITY WAIVER
// ─────────────────────────────────────────────────────────────────────────

const ADULT_LIABILITY = `# Release of Liability, Waiver of Claims, Assumption of Risk and Indemnity Agreement

**PLEASE READ CAREFULLY. THIS AGREEMENT AFFECTS YOUR LEGAL RIGHTS. BY SIGNING IT YOU GIVE UP YOUR RIGHT TO SUE THE RELEASED PARTIES FOR INJURY OR DEATH CAUSED BY THEIR ORDINARY NEGLIGENCE. DO NOT SIGN IT UNLESS YOU UNDERSTAND AND AGREE WITH IT.**

## 1. Who and What This Covers

This agreement is between me and ${GYM}. It protects ${RELEASED_PARTIES}. It covers ${ACTIVITIES}.

## 2. I Choose to Participate

My participation is completely voluntary. I am not required to take part in any Activity, and I may stop at any time.

## 3. Boxing Is Dangerous

Boxing is a combat sport. Being hit, and hitting others, is part of the sport and cannot be made completely safe, no matter how careful everyone is. The risks include, but are not limited to:

${RISK_LIST}

[[initial:risks]]

## 4. I Assume the Risks

**I KNOWINGLY AND VOLUNTARILY ACCEPT AND ASSUME ALL OF THESE RISKS, BOTH KNOWN AND UNKNOWN, INCLUDING RISKS CAUSED BY THE ORDINARY NEGLIGENCE OF THE RELEASED PARTIES OR OF OTHER PARTICIPANTS.**

[[initial:assumption]]

## 5. Sparring and Contact

I will only spar, or do any drill that involves hitting another person, when a Gym coach has approved it and is supervising, and only while wearing the protective gear the Gym requires (for example a mouthguard, hand wraps, approved gloves, and headgear when required). I understand that protective gear reduces but **does not eliminate** the risk of injury, and that **headgear does not prevent concussions**. I may decline any contact drill or sparring at any time, and the Gym may stop or refuse any sparring at any time.

## 6. Concussions and Head Injuries

I will learn the signs of a concussion, including headache, dizziness, confusion, blurred vision, nausea, ringing in the ears, memory problems, and feeling "foggy." If I have any of these signs or take a hard blow to the head, I will **stop immediately**, tell a coach, and not return to sparring or contact training until a licensed health care provider has cleared me **in writing**. The Gym may remove me from any Activity if it believes I may be injured.

## 7. My Health

I confirm that I am physically able to take part in the Activities. The Gym recommends that I see a doctor before starting, and I accept responsibility for that decision. I will tell a coach about any condition that could affect my safety, such as heart problems, high blood pressure, fainting or seizures, a past concussion, pregnancy, recent surgery or injury, or medication that affects my balance, heart or alertness. I will not train under the influence of alcohol or drugs. I will stop and tell staff if I feel chest pain, faintness, shortness of breath or anything unusual. I understand Gym staff are not doctors and do not give medical advice.

## 8. Release and Waiver of Liability

**I, FOR MYSELF AND FOR MY HEIRS, EXECUTORS, ADMINISTRATORS, PERSONAL REPRESENTATIVES AND ASSIGNS, RELEASE, WAIVE, DISCHARGE AND PROMISE NOT TO SUE THE RELEASED PARTIES FOR ANY AND ALL CLAIMS, DEMANDS, LOSSES AND LIABILITY FOR PERSONAL INJURY, ILLNESS, DISABILITY, DEATH OR PROPERTY DAMAGE ARISING OUT OF OR RELATED TO THE ACTIVITIES OR MY PRESENCE AT THE GYM, INCLUDING CLAIMS CAUSED IN WHOLE OR IN PART BY THE ORDINARY NEGLIGENCE OF ANY RELEASED PARTY, WHETHER OR NOT I AM USING EXERCISE EQUIPMENT AND WHETHER OR NOT THE ACTIVITY IS SUPERVISED.**

[[initial:release]]

## 9. What This Agreement Does Not Release

${NOT_RELEASED}

## 10. My Promise to Indemnify

To the extent allowed by law, I will indemnify, defend and hold harmless the Released Parties from any claim, loss, cost or expense (including reasonable attorney fees) that results from (a) my own actions, negligence or breaking of Gym rules that injure another person or damage property, or (b) a claim brought by me or on my behalf that this agreement releases.

## 11. Unknown Claims (Civil Code §1542)

${SECTION_1542}

## 12. Emergency Medical Care

If I am injured or become ill, I authorize the Gym to give first aid, perform CPR, use an AED (defibrillator), call 911, and arrange emergency transport and treatment. I am responsible for all costs of that care and transport. The Gym is not required to provide care beyond calling emergency services.

## 13. Gym Rules and Filming Code of Conduct

I will follow all posted Gym rules and every instruction from coaches and staff. I will also follow this Filming Code of Conduct:

${FILMING_CODE}

The Gym may remove me from any Activity, or end my membership, if I break these rules or put anyone at risk.

## 14. Personal Property

To the extent allowed by law, the Gym is not responsible for personal property that is lost, stolen or damaged at the Gym.

## 15. How Long This Agreement Lasts

This agreement applies to every visit and every Activity from the day I sign it until I sign an updated version or revoke it in writing. If I revoke it, I may no longer take part in the Activities.

## 16. Electronic Signature

${ESIGN}

## 17. California Law and Severability

${LAW_AND_SEVERABILITY}

## 18. My Acknowledgment

**I HAVE READ THIS ENTIRE AGREEMENT AND I UNDERSTAND IT. I AM AT LEAST 18 YEARS OLD AND LEGALLY ABLE TO SIGN IT. I UNDERSTAND THAT BY SIGNING IT I AM GIVING UP SUBSTANTIAL LEGAL RIGHTS, INCLUDING MY RIGHT TO SUE THE RELEASED PARTIES FOR THEIR ORDINARY NEGLIGENCE. I AM SIGNING IT FREELY AND VOLUNTARILY, AND I INTEND MY SIGNATURE TO BE A COMPLETE AND UNCONDITIONAL RELEASE OF LIABILITY TO THE GREATEST EXTENT ALLOWED BY LAW.**

[[initial:acknowledge]]`

// ─────────────────────────────────────────────────────────────────────────
// 2. MINOR LIABILITY WAIVER (signed by a parent or legal guardian)
// ─────────────────────────────────────────────────────────────────────────

const MINOR_LIABILITY = `# Minor Participant Release of Liability, Assumption of Risk and Indemnity Agreement

**FOR A PARTICIPANT UNDER 18. TO BE SIGNED BY A PARENT OR LEGAL GUARDIAN.**

**PLEASE READ CAREFULLY. THIS AGREEMENT AFFECTS YOUR LEGAL RIGHTS AND YOUR CHILD'S LEGAL RIGHTS. BY SIGNING IT YOU GIVE UP, FOR YOURSELF AND FOR YOUR CHILD, THE RIGHT TO SUE THE RELEASED PARTIES FOR INJURY OR DEATH CAUSED BY THEIR ORDINARY NEGLIGENCE.**

## 1. Who and What This Covers

In this agreement, **"I"** means the parent or legal guardian signing, and the **"Minor"** means the participant under 18 named on this agreement. This agreement is between me, on my own behalf and on behalf of the Minor, and ${GYM}. It protects ${RELEASED_PARTIES}. It covers ${ACTIVITIES}.

## 2. My Authority

I confirm that I am the Minor's parent or legal guardian and that I have the legal authority to sign this agreement for the Minor. I confirm that the Minor's name and date of birth on this agreement are correct.

## 3. Voluntary Participation

The Minor's participation is completely voluntary. I may withdraw the Minor at any time, and the Minor may stop at any time.

## 4. Boxing Is Dangerous

Boxing is a combat sport. Being hit, and hitting others, is part of the sport and cannot be made completely safe, no matter how careful everyone is. Young athletes may be more vulnerable to some injuries, including concussions. The risks include, but are not limited to:

${RISK_LIST}

[[initial:risks]]

## 5. I Assume the Risks for the Minor and Myself

**I KNOWINGLY AND VOLUNTARILY ACCEPT AND ASSUME, ON BEHALF OF THE MINOR AND MYSELF, ALL OF THESE RISKS, BOTH KNOWN AND UNKNOWN, INCLUDING RISKS CAUSED BY THE ORDINARY NEGLIGENCE OF THE RELEASED PARTIES OR OF OTHER PARTICIPANTS.**

[[initial:assumption]]

## 6. Sparring and Contact for Minors

The Minor will only spar, or do any drill that involves hitting another person, when a Gym coach has approved it and is directly supervising, with a partner the coach considers appropriate for the Minor's age, size and experience, and only while wearing the protective gear the Gym requires. Protective gear reduces but **does not eliminate** the risk of injury, and **headgear does not prevent concussions**. If I do not want the Minor to spar, I will tell the Gym in writing, and the Gym will not allow the Minor to spar.

## 7. Youth Concussion and Sudden Cardiac Arrest Information

California law (Health and Safety Code §124235) requires youth sports organizations, including boxing programs, to share this information every year with each young athlete and their parent or guardian before the athlete practices or competes.

**What a concussion is.** A concussion is a brain injury caused by a bump, blow or jolt to the head or body that makes the brain move quickly inside the skull. It can happen even without a direct blow to the head and even without losing consciousness. Most concussions do not involve passing out.

**Signs and symptoms to watch for:**
- Headache or "pressure" in the head; nausea or vomiting
- Dizziness, balance problems, blurred or double vision
- Sensitivity to light or noise; ringing in the ears
- Feeling sluggish, foggy, groggy or confused; trouble concentrating or remembering
- Mood or behavior changes, irritability, sadness, unusual drowsiness or trouble sleeping
- Slurred speech, a dazed look, or losing consciousness, even briefly

**Danger signs that need emergency care (call 911):** one pupil larger than the other; drowsiness or inability to wake up; a headache that gets worse; repeated vomiting; weakness, numbness or decreased coordination; slurred speech; convulsions or seizures; or loss of consciousness.

**Removal and return.** If the Minor is suspected of having a concussion or head injury, the Gym will remove the Minor from all Activities for the rest of the day and will notify me. The Minor may not return to any Activity until evaluated by a licensed health care provider trained in the evaluation and management of concussions and cleared **in writing** by that provider. If a concussion is diagnosed, the Minor must also complete a graduated return-to-play protocol of **at least seven days** under the supervision of a licensed health care provider.

**Sudden cardiac arrest.** Sudden cardiac arrest happens when the heart suddenly stops beating effectively. It can be fatal within minutes without CPR and an AED. **Warning signs** include fainting or seizure during or right after exercise, chest pain, unusual shortness of breath, a racing or fluttering heartbeat, and dizziness or lightheadedness during exercise. If the Minor faints or shows signs of a heart problem, the Gym will remove the Minor from Activity and the Minor may not return until cleared **in writing** by a licensed health care provider. I will tell the Gym if the Minor has a heart condition, a history of fainting during exercise, or a family history of sudden cardiac death before age 50.

[[initial:concussion]]

## 8. The Minor's Health

I confirm that the Minor is physically able to take part in the Activities and that I have told the Gym, in writing, about any condition that could affect the Minor's safety, such as asthma, allergies, heart problems, fainting or seizures, a past concussion, recent surgery or injury, or medication. I will update the Gym if anything changes. Gym staff are not doctors and do not give medical advice.

## 9. Supervision Outside Classes

The Gym does not provide childcare. I am responsible for the Minor before and after scheduled classes and sessions, including drop-off and pick-up on time.

## 10. Release and Waiver of Liability

**ON BEHALF OF THE MINOR AND MYSELF, AND OUR HEIRS, EXECUTORS, ADMINISTRATORS, PERSONAL REPRESENTATIVES AND ASSIGNS, I RELEASE, WAIVE, DISCHARGE AND PROMISE NOT TO SUE THE RELEASED PARTIES FOR ANY AND ALL CLAIMS, DEMANDS, LOSSES AND LIABILITY FOR PERSONAL INJURY, ILLNESS, DISABILITY, DEATH OR PROPERTY DAMAGE TO THE MINOR, AND FOR MY OWN RELATED CLAIMS (INCLUDING MEDICAL EXPENSES AND LOSS OF THE MINOR'S SERVICES OR COMPANIONSHIP), ARISING OUT OF OR RELATED TO THE ACTIVITIES OR THE MINOR'S PRESENCE AT THE GYM, INCLUDING CLAIMS CAUSED IN WHOLE OR IN PART BY THE ORDINARY NEGLIGENCE OF ANY RELEASED PARTY, WHETHER OR NOT THE MINOR IS USING EXERCISE EQUIPMENT AND WHETHER OR NOT THE ACTIVITY IS SUPERVISED.**

[[initial:release]]

## 11. My Promise to Indemnify

To the extent allowed by law, I will indemnify, defend and hold harmless the Released Parties from any claim, loss, cost or expense (including reasonable attorney fees) that results from (a) the Minor's actions or breaking of Gym rules that injure another person or damage property, or (b) a claim brought by me, the Minor, or anyone on the Minor's behalf that this agreement releases.

## 12. What This Agreement Does Not Release

${NOT_RELEASED}

## 13. Unknown Claims (Civil Code §1542)

${SECTION_1542}

## 14. Emergency Medical Care

If the Minor is injured or becomes ill and I cannot be reached right away, I authorize the Gym to give first aid, perform CPR, use an AED (defibrillator), call 911, and arrange emergency transport and treatment for the Minor, and I consent to that treatment. I am responsible for all costs of that care and transport. The Gym will try to contact me as soon as possible.

## 15. Gym Rules and Filming Code of Conduct

I will make sure the Minor follows all posted Gym rules and every instruction from coaches and staff. When I am at the Gym, I will follow them too, including this Filming Code of Conduct:

${FILMING_CODE}

The Gym may remove the Minor or me from any Activity, or end the membership, if these rules are broken or anyone is put at risk.

## 16. Personal Property

To the extent allowed by law, the Gym is not responsible for personal property that is lost, stolen or damaged at the Gym.

## 17. How Long This Agreement Lasts

This agreement lasts for **one year** from the day I sign it, or until I sign an updated version, whichever comes first. It must be signed again each year because California requires the youth concussion and cardiac information to be reviewed every year. When the Minor turns 18, the Minor must sign the adult agreement personally.

## 18. Electronic Signature

${ESIGN}

## 19. California Law and Severability

${LAW_AND_SEVERABILITY}

## 20. My Acknowledgment

**I HAVE READ THIS ENTIRE AGREEMENT, INCLUDING THE YOUTH CONCUSSION AND SUDDEN CARDIAC ARREST INFORMATION, AND I UNDERSTAND IT. I HAVE REVIEWED THAT INFORMATION WITH THE MINOR. I AM THE MINOR'S PARENT OR LEGAL GUARDIAN. I UNDERSTAND THAT BY SIGNING I AM GIVING UP SUBSTANTIAL LEGAL RIGHTS FOR THE MINOR AND FOR MYSELF, INCLUDING THE RIGHT TO SUE THE RELEASED PARTIES FOR THEIR ORDINARY NEGLIGENCE. I AM SIGNING FREELY AND VOLUNTARILY.**

[[initial:acknowledge]]`

// ─────────────────────────────────────────────────────────────────────────
// 3. PHOTO, VIDEO & SOCIAL MEDIA RELEASE (everyone; parent signs for minors)
// ─────────────────────────────────────────────────────────────────────────

const MEDIA_RELEASE = `# Photo, Video and Social Media Release and Filming Notice

**PLEASE READ CAREFULLY. This release is required to train at the Gym.** If you are signing for a participant under 18, **"I"** and **"me"** in this release also mean the participant you are signing for.

## 1. Filming Happens at the Gym

${GYM} is an active training space. The Gym, its coaches, and members and guests regularly take photos and videos for training, social media and marketing. I understand that when I am at the Gym or at a Gym event, **I may be photographed or recorded, including in the background of other people's photos and videos.**

## 2. Permission for the Gym to Use My Image

I give the Gym, and people working on its behalf, permission to photograph, film and record me at the Gym and at Gym events, and to use my image, likeness, voice and first name in that content, in any media (including the Gym's website, social media, advertising, printed materials and videos), for promotional, marketing, educational and other lawful business purposes. This is my written consent under California Civil Code §3344. I will not be paid for this use, I do not need to approve the content before it is used, and the Gym owns the photos and recordings it makes.

## 3. Extra Protections for Children

For participants under 18, the Gym will:
- Use **first names only**, and never publish a child's full name, school, home address or other personal details;
- Not tag a child's personal social media accounts without the parent's separate permission;
- Not publish images that show a child undressed, in distress, or in an embarrassing way; and
- Remove a child's image from the Gym's own accounts on a parent's request (see Section 5).

## 4. No AI Copies

The Gym will not use my image, likeness or voice to create AI-generated or digitally altered "digital replicas" of me.

## 5. Asking the Gym to Take Something Down

I can ask the Gym at any time to remove a specific photo or video of me from accounts the Gym controls by contacting ${SITE.email} or ${SITE.phone}. The Gym will remove it within a reasonable time, usually within 7 days. The Gym cannot recall printed materials already handed out, or content that other people have already saved, shared or reposted.

## 6. Photos and Videos Taken by Other Members

Other members and guests may film at the Gym. The Gym does not control and is not responsible for content that other people create or post, but it enforces the Filming Code of Conduct below and will ask people to stop filming or delete content when the rules are broken. I should report problems to staff right away. To the extent allowed by law, I release the Released Parties named in my liability waiver from claims about photos or videos taken or posted by other members or guests.

## 7. Filming Code of Conduct

When I am at the Gym, I will:

${FILMING_CODE}

[[initial:media]]

## 8. How Long This Release Lasts

This release applies to content created while I train at the Gym, and the Gym may keep using that content after my membership ends unless I ask for a takedown under Section 5. Because this release is a condition of training at the Gym, if I revoke it in writing for future content, I may no longer be able to train at the Gym.

## 9. Electronic Signature and California Law

${ESIGN} California law governs this release.

## 10. My Acknowledgment

**I HAVE READ THIS RELEASE AND I UNDERSTAND IT. I AM AT LEAST 18 YEARS OLD, OR I AM THE PARENT OR LEGAL GUARDIAN OF THE PARTICIPANT UNDER 18 I AM SIGNING FOR. I AM SIGNING IT FREELY AND VOLUNTARILY.**`

export const WAIVER_DOCUMENTS: WaiverDocument[] = [
  {
    kind: 'liability',
    audience: 'adult',
    version: DOCUMENT_VERSION,
    title: 'Release of Liability, Waiver of Claims, Assumption of Risk and Indemnity Agreement',
    shortName: 'Liability Waiver',
    body: ADULT_LIABILITY,
  },
  {
    kind: 'liability',
    audience: 'minor',
    version: DOCUMENT_VERSION,
    title: 'Minor Participant Release of Liability, Assumption of Risk and Indemnity Agreement',
    shortName: 'Minor Liability Waiver',
    body: MINOR_LIABILITY,
  },
  {
    kind: 'media',
    audience: 'all',
    version: DOCUMENT_VERSION,
    title: 'Photo, Video and Social Media Release and Filming Notice',
    shortName: 'Photo & Video Release',
    body: MEDIA_RELEASE,
  },
]

/** The documents a participant of this age must have on file, in signing order. */
export function requiredDocuments(age: number): WaiverDocument[] {
  const audience: WaiverAudience = age < 18 ? 'minor' : 'adult'
  return WAIVER_DOCUMENTS.filter(d =>
    (d.kind === 'liability' && d.audience === audience) || d.kind === 'media'
  )
}

/** Initial markers in a document body, in order (e.g. ['risks', 'assumption', ...]). */
export function initialKeys(body: string): string[] {
  return [...body.matchAll(/\[\[initial:([a-z_]+)\]\]/g)].map(m => m[1])
}
