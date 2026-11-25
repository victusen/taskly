export async function prepareManualRecipientSource(config) {
  const recipients = Array.isArray(config.recipients) ? config.recipients : [];
  const copyRecipientCount =
    (Array.isArray(config.cc) ? config.cc.length : 0) +
    (Array.isArray(config.bcc) ? config.bcc.length : 0);
  return {
    type: "manual",
    recipients,
    recipientCount: recipients.length * (copyRecipientCount + 1),
  };
}
