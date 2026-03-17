const LAST_UPDATED = "March 17, 2026";

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div className="glass-card p-6 sm:p-8 space-y-6">
        <header className="space-y-2">
          <h1
            className="text-2xl sm:text-3xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Privacy Policy
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Last updated: {LAST_UPDATED}
          </p>
        </header>

        <section
          className="space-y-2 text-sm leading-6"
          style={{ color: "var(--text-secondary)" }}
        >
          <p>
            Eazee helps businesses create and schedule WhatsApp marketing
            messages. We only collect information needed to provide this
            service.
          </p>
        </section>

        <section
          className="space-y-2 text-sm leading-6"
          style={{ color: "var(--text-secondary)" }}
        >
          <h2
            className="text-base font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Data we process
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Message content you create in the app.</li>
            <li>
              Recipient phone numbers you provide for scheduling and dispatch.
            </li>
            <li>Webhook delivery events from WhatsApp Cloud API.</li>
          </ul>
        </section>

        <section
          className="space-y-2 text-sm leading-6"
          style={{ color: "var(--text-secondary)" }}
        >
          <h2
            className="text-base font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            How we use data
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>To schedule and send WhatsApp messages requested by you.</li>
            <li>To show delivery status and troubleshoot failed sends.</li>
            <li>To improve reliability and security of the service.</li>
          </ul>
        </section>

        <section
          className="space-y-2 text-sm leading-6"
          style={{ color: "var(--text-secondary)" }}
        >
          <h2
            className="text-base font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Data retention
          </h2>
          <p>
            Scheduled jobs and webhook event data are retained only as long as
            required for dispatch, status tracking, and operational
            troubleshooting.
          </p>
        </section>

        <section
          className="space-y-2 text-sm leading-6"
          style={{ color: "var(--text-secondary)" }}
        >
          <h2
            id="user-data-deletion"
            className="text-base font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            User data deletion
          </h2>
          <p>
            You can request deletion of your stored scheduling and webhook
            records by contacting the Eazee support channel used for your
            account onboarding. Include your business identifier and phone
            number so we can locate your records.
          </p>
        </section>

        <section
          className="space-y-2 text-sm leading-6"
          style={{ color: "var(--text-secondary)" }}
        >
          <h2
            className="text-base font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Contact
          </h2>
          <p>
            For privacy requests or questions, contact the Eazee team at your
            official support channel.
          </p>
        </section>
      </div>
    </div>
  );
}
