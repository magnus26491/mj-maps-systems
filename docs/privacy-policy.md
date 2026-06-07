# Privacy Policy — MJ Maps
**Last updated: 7 June 2026**
**Data Controller: [YOUR COMPANY NAME] | contact@mjmaps.co.uk**

## 1. Who We Are
[YOUR COMPANY NAME] ("we", "us", "our") operates the MJ Maps Driver application.
We are registered in England and Wales. For data protection enquiries:
**contact@mjmaps.co.uk**

## 2. Data We Collect

| Data Type | Purpose | Lawful Basis |
|-----------|---------|--------------|
| Email address & password (hashed) | Account authentication | Contract performance |
| Precise GPS location (continuous, background) | Delivery route tracking, turn analysis, customer ETAs | Consent + Legitimate interests |
| Camera photos (proof of delivery) | Delivery confirmation audit trail | Legitimate interests |
| Device FCM token | Push notifications (shift alerts, dispatch updates) | Consent |
| Vehicle specification | Route and turn-clearance calculations | Contract performance |
| Delivery stop data (addresses, outcomes, timestamps) | Operational records | Legitimate interests |
| IP address & device metadata | Security and fraud prevention | Legitimate interests |

## 3. Background Location
MJ Maps collects your precise location data **even when the app is closed or not in use**,
for the duration of an active delivery shift. This is used exclusively for:
- Real-time delivery route progress tracking
- Turn difficulty analysis and vehicle clearance alerts
- Accurate ETA calculation for customer SMS notifications

You can withdraw consent at any time by ending your shift or disabling
location permissions in your device settings.

## 4. Third Parties We Share Data With

| Party | Purpose | Location |
|-------|---------|----------|
| Railway.app | Secure server hosting | EU West (Netherlands) — EEA |
| Google Firebase | Push notification delivery (FCM) | EU servers |
| Twilio | Customer ETA SMS messages | EU infrastructure |
| Google Maps Platform | Routing and map display | EU servers |

We **never sell** your personal data. No data is shared with advertising networks.

## 5. Data Retention

| Data Type | Retention Period |
|-----------|-----------------|
| Account data | Until account deletion |
| GPS location logs | 30 days after each delivery |
| Delivery records (routes, stops) | 7 years (UK Companies Act 2006) |
| Proof-of-delivery photos | 7 years |
| Push notification audit logs | 90 days |
| Refresh tokens | 30 days |

## 6. Your Rights (UK GDPR)
You have the right to:
- **Access** a copy of your personal data (email: contact@mjmaps.co.uk)
- **Erasure** — delete your account in-app via Settings → Delete Account
- **Rectification** — correct inaccurate data via your profile settings
- **Portability** — receive your data in a machine-readable format on request
- **Object** — object to processing based on legitimate interests
- **Withdraw consent** — for location tracking and push notifications at any time

To exercise any right, email: **contact@mjmaps.co.uk** (response within 30 days)

## 7. Security
All data is transmitted using TLS 1.3 encryption. Passwords are stored as
bcrypt hashes and never in plaintext. Authentication uses short-lived JWTs
(15-minute access tokens) with server-side refresh token rotation.

## 8. Children
MJ Maps is a professional logistics tool intended for adults (18+).
We do not knowingly collect data from children under 18.

## 9. Supervisory Authority
If you have concerns about how we handle your data, you have the right to
lodge a complaint with the **Information Commissioner's Office (ICO)**:
- Website: ico.org.uk
- Phone: 0303 123 1113

## 10. Changes to This Policy
We will notify users of material changes via in-app notification.
The "Last updated" date at the top reflects the current version.