export type LegalSection = { heading: string; body: string };
export type LegalDoc = { title: string; subtitle: string; updated: string; sections: LegalSection[] };

export const LEGAL_DOCS: Record<string, LegalDoc> = {
  terms: {
    title: "Terms & Conditions",
    subtitle: "The rules of the golden house",
    updated: "Last updated: September 2026",
    sections: [
      {
        heading: "1. Welcome to Glint",
        body: "These Terms & Conditions (\"Terms\") form a binding agreement between you and Glint (\"we\", \"us\", \"the Service\"). By creating an account, accessing, or using Glint, you agree to these Terms, our Privacy Policy, and our Community Standards. If you do not agree, please do not use Glint.",
      },
      {
        heading: "2. Eligibility",
        body: "You must be at least 13 years old (or the minimum age of digital consent in your country) to use Glint. By registering, you confirm that all information you provide is accurate and that you are legally able to enter into this agreement. Accounts found to belong to under-age users will be removed.",
      },
      {
        heading: "3. Your Account",
        body: "You are responsible for everything that happens under your account. Keep your password confidential and notify us immediately via the Help Center if you suspect unauthorized access. Usernames are granted on a first-come basis and may be reclaimed if they infringe trademarks, impersonate others, or remain inactive with deceptive intent.",
      },
      {
        heading: "4. Your Content",
        body: "You own the photos, videos, voice notes, text, polls, and stories you post (\"Content\"). By posting, you grant Glint a worldwide, non-exclusive, royalty-free license to host, store, reproduce, display, and distribute your Content solely to operate and improve the Service. This license ends when you delete your Content or account, except where Content has been shared by others or retained for legal obligations.",
      },
      {
        heading: "5. Blue Tick Verification",
        body: "The Blue Tick is a badge of authenticity granted at our discretion after review of submitted documents. It confirms identity — not endorsement. Misuse of verification documents, or attempting to buy, sell, or transfer a Blue Tick, results in immediate badge removal and possible suspension.",
      },
      {
        heading: "6. Sparks & Virtual Items",
        body: "Sparks are virtual tokens with no monetary value. They cannot be exchanged for cash, transferred outside Glint, or redeemed for real-world goods. We may adjust Spark balances, earning rules, and availability at any time. Fraudulent earning or tipping activity will result in balance forfeiture.",
      },
      {
        heading: "7. Golden Hours & Features",
        body: "Golden Hours, Voice Stories, Inner Circle, AI Caption Studio, and other features are provided \"as is\" and may change, pause, or end at any time. AI-generated captions are suggestions; you are responsible for the final content you publish.",
      },
      {
        heading: "8. Prohibited Conduct",
        body: "You agree not to: break any law; harass, threaten, or harm others; post illegal, hateful, sexually exploitative, or violent content; spam or manipulate engagement; scrape or data-mine the Service; upload malware; impersonate any person or entity; interfere with the Service's operation; or create accounts after a ban. See our Community Standards for full details.",
      },
      {
        heading: "9. Enforcement",
        body: "We may remove content, limit features, suspend, or permanently terminate accounts that violate these Terms — with or without notice, depending on severity. You may appeal enforcement decisions through the Help Center.",
      },
      {
        heading: "10. Intellectual Property",
        body: "The Glint name, logo, Blue Tick design, app design, and all software are our property. You may not copy, modify, distribute, sell, or reverse-engineer any part of the Service without written permission.",
      },
      {
        heading: "11. Disclaimers & Liability",
        body: "Glint is provided \"as is\" and \"as available\" without warranties of any kind. To the maximum extent permitted by law, we are not liable for indirect, incidental, or consequential damages, lost profits, or data loss arising from your use of the Service. Our total liability is limited to the amount you paid us in the past 12 months (or USD 50 if none).",
      },
      {
        heading: "12. Termination",
        body: "You may delete your account anytime in Settings. We may terminate or suspend access for violations, legal requirements, or extended inactivity. Upon termination, your right to use Glint ends immediately; provisions on ownership, disclaimers, and liability survive.",
      },
      {
        heading: "13. Changes to These Terms",
        body: "We may update these Terms from time to time. Material changes will be announced in-app at least 7 days before taking effect. Continued use after changes means you accept the updated Terms.",
      },
      {
        heading: "14. Contact",
        body: "Questions about these Terms? Reach us any time via Settings → Help Center inside the app.",
      },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    subtitle: "How we treat your data — with care",
    updated: "Last updated: September 2026",
    sections: [
      {
        heading: "1. Overview",
        body: "This Privacy Policy explains what information Glint collects, why we collect it, how we use and protect it, and the choices you have. By using Glint you agree to the practices described here.",
      },
      {
        heading: "2. Information You Give Us",
        body: "• Account data: full name, username, email or phone number, and password (stored only as a secure hash).\n• Profile data: avatar, cover photo, bio, and location (all optional).\n• Content: posts, polls, stories, voice notes, messages, comments, and reactions you create.\n• Verification data: documents you submit for the Golden Tick, used only for review.\n• Support data: help tickets and reports you file.",
      },
      {
        heading: "3. Information Collected Automatically",
        body: "• Usage data: screens visited, features used, and interaction timestamps to improve the app.\n• Device data: device type, operating system, and app version for compatibility and debugging.\n• Story views: who viewed each story (visible to the story creator until expiry).\n• Sparks activity: balances and tipping history, to prevent fraud.",
      },
      {
        heading: "4. How We Use Information",
        body: "We use your information to: operate and personalize the Service (feed, friend suggestions, Golden Hours); deliver messages and notifications; review verification and safety reports; prevent spam, fraud, and abuse; comply with legal obligations; and analyze aggregated trends to improve Glint. We do not sell your personal data.",
      },
      {
        heading: "5. How Information Is Shared",
        body: "• Public content: public posts and profiles are visible to everyone; \"Friends\" and \"Inner Circle\" audiences restrict visibility accordingly.\n• Friends: your friends see your activity such as reactions, comments, and stories per your privacy settings.\n• Service providers: trusted infrastructure providers (cloud hosting, media storage, AI caption processing) that act on our instructions under confidentiality obligations.\n• Legal: when required by law, court order, or to protect safety and rights.",
      },
      {
        heading: "6. Messages & Privacy Controls",
        body: "Direct messages are visible only to their participants. Group chats are visible to all group members. You control who sees your posts (Public / Friends / Inner Circle), whether your profile is public or friends-only, and who can reach you — all from Settings and the composer.",
      },
      {
        heading: "7. Data Retention",
        body: "Stories and voice drops auto-delete after 24 hours. Messages, posts, and account data are kept while your account is active. When you delete your account, your profile, posts, and stories are permanently removed within 30 days, except data we must retain for legal or safety reasons.",
      },
      {
        heading: "8. Your Rights & Choices",
        body: "Depending on your region, you may have rights to access, correct, export, or delete your personal data, and to object to or restrict certain processing. You can exercise most of these directly in the app (edit profile, download/delete content, delete account) or via Settings → Help Center.",
      },
      {
        heading: "9. Data Security",
        body: "We protect your data with encryption in transit, hashed passwords, access controls, and monitored infrastructure. No method is 100% secure; if a breach affects your data, we will notify you promptly as required by law.",
      },
      {
        heading: "10. Children's Privacy",
        body: "Glint is not directed at children under 13 (or the applicable age of consent). We do not knowingly collect their data. If you believe a child has created an account, report it via the Help Center and we will remove it.",
      },
      {
        heading: "11. International Transfers",
        body: "Your data may be processed in countries other than your own. Where required, we use appropriate safeguards (such as standard contractual clauses) for cross-border transfers.",
      },
      {
        heading: "12. Changes & Contact",
        body: "We may update this Policy and will announce material changes in-app before they take effect. Privacy questions or requests: Settings → Help Center.",
      },
    ],
  },
  guidelines: {
    title: "Community Standards",
    subtitle: "Keep the gold standard",
    updated: "Last updated: September 2026",
    sections: [
      {
        heading: "1. Our Golden Rule",
        body: "Glint is a place to shine — not to dim others. Treat every member with respect. Content and behavior that harm, harass, or endanger people have no place here. These Standards apply to posts, stories, voice notes, messages, profiles, usernames, and Blue Tick applications.",
      },
      {
        heading: "2. Be Authentic",
        body: "Use your real identity and don't impersonate people, brands, or organizations. Parody or fan accounts must be clearly labeled. Do not misrepresent verification status or forge Blue Tick badges.",
      },
      {
        heading: "3. Harassment & Bullying",
        body: "Zero tolerance for targeted abuse, threats, shaming, unwanted sexual advances, doxxing (sharing private information), or coordinated attacks. Disagree with ideas — never attack people.",
      },
      {
        heading: "4. Hate Speech",
        body: "Content that attacks or dehumanizes people based on race, ethnicity, nationality, religion, caste, gender, gender identity, sexual orientation, disability, or serious disease is prohibited and leads to removal and suspension.",
      },
      {
        heading: "5. Violence & Dangerous Acts",
        body: "No glorification of violence, graphic gore, threats of harm, or content promoting terrorism, extremist groups, or self-harm. If you or someone you know is struggling, please reach out to local crisis resources — our Help Center can point the way.",
      },
      {
        heading: "6. Nudity & Sexual Content",
        body: "Adult nudity and sexually explicit content are not allowed. Any sexual content involving minors is strictly prohibited and reported to authorities. Non-consensual intimate imagery results in an immediate permanent ban.",
      },
      {
        heading: "7. Safety of Minors",
        body: "Any content that sexualizes, exploits, or endangers minors is removed and reported to the relevant child-protection authorities. Accounts engaging in grooming behavior are permanently banned.",
      },
      {
        heading: "8. Spam & Platform Manipulation",
        body: "No bulk messaging, fake engagement, follow/unfollow schemes, engagement pods, or Spark farming with multiple accounts. Don't mislead people with clickbait, phishing links, or scams.",
      },
      {
        heading: "9. Misinformation",
        body: "Don't share demonstrably false content likely to cause harm — including dangerous health misinformation, election interference, or manipulated media presented as real. Satire must be obvious.",
      },
      {
        heading: "10. Illegal Goods & Services",
        body: "No buying, selling, or facilitating drugs, weapons, counterfeit goods, stolen data, or regulated services through Glint.",
      },
      {
        heading: "11. Intellectual Property",
        body: "Only post content you own or have rights to. Repeated copyright or trademark violations lead to suspension. Rights holders can report infringement via the Help Center.",
      },
      {
        heading: "12. Enforcement & Appeals",
        body: "Violations may result in content removal, feature limits, temporary suspension, or a permanent ban — based on severity and history. Think we got it wrong? Appeal through Settings → Help Center and a human moderator will review your case.",
      },
      {
        heading: "13. Reporting",
        body: "See something that breaks these Standards? Use the Report option on any post, story, message, or profile. Reports are confidential, reviewed by our team, and never revealed to the reported member.",
      },
    ],
  },
};
