# Webhooks

Webhooks are available on the Team plan. Create one in **Settings > Integrations > Webhooks** and choose the events to send. Fernwick signs each request with the header X-Fernwick-Signature.

A failed delivery is retried 5 times over 24 hours. After that the event is dropped.

_Synthetic sample content for a demo. Fernwick is not a real product._
