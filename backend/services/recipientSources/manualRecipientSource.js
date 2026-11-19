export async function prepareManualRecipientSource(config) {
  const recipients = Array.isArray(config.recipients) ? config.recipients : [];
  return {
    type: "manual",
    recipients,
    recipientCount: recipients.length,
  };
}
