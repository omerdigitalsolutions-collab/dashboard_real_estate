export async function sendWhatsAppWebhook(payload: object): Promise<boolean> {
    const webhookUrl = import.meta.env.VITE_WHATSAPP_WEBHOOK_URL || 'https://hook.us1.make.com/dummy';

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            console.error('Webhook failed with status:', response.status);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error calling webhook:', error);
        return false;
    }
}
