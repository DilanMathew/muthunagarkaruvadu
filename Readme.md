# Muthunagar Karuvadu

Website and online ordering for Muthunagar Karuvadu, which sells traditional sun-dried fish from Thoothukudi.

- **Storefront:** an animated sunrise-over-the-sea hero, the brand story, how it's made, and recipes. Product prices and descriptions are in Tamil and English.
- **Ordering:** cart, then delivery details (pincode-based delivery fee and ETA), then payment by UPI (QR code + "Pay with UPI app") or cash on delivery.
- **Tracking:** customers track orders at `/track` with their order ID and mobile number.
- **Instagram links:** `/p/<product>` opens that product directly, for example `/p/nethili?src=ig`. Use these in comment-to-DM automations. The `src` value is saved on each order, so you can see which orders came from Instagram.
- **Bulk orders:** orders above `BULK_THRESHOLD_KG` (default 5 kg) are sent to WhatsApp with a pre-filled message.
- **Admin (`/admin`):** see orders, change status and payment, add a courier tracking link, send the customer a ready-made WhatsApp message, copy the address, and edit prices, stock and photos.

## Run locally

```bash
npm install
ADMIN_PASSWORD=secret UPI_ID=yourname@upi WHATSAPP_NUMBER=919XXXXXXXXX npm start
```

Then open http://localhost:3000, and http://localhost:3000/admin for the admin page.

## Railway variables

| Variable | Purpose |
| --- | --- |
| `ADMIN_PASSWORD` | Password for `/admin` (required to use the admin page) |
| `WHATSAPP_NUMBER` | Shop WhatsApp number with country code, for example `919876543210` |
| `BULK_WHATSAPP_NUMBER` | Optional separate number for bulk enquiries |
| `UPI_ID` | UPI ID that receives payments. If empty, only COD is offered |
| `UPI_NAME` | Name shown in UPI apps |
| `INSTAGRAM_URL` | Instagram profile link |
| `MIN_ORDER` / `FREE_DELIVERY_ABOVE` / `BULK_THRESHOLD_KG` / `COD_FEE` | Business rules (defaults: 300 / 1500 / 5 / 40) |
| `COD_ENABLED` | Set to `false` to turn off cash on delivery |
| `DATA_DIR` | Where orders and products are stored. Railway volumes set this automatically through `RAILWAY_VOLUME_MOUNT_PATH` |

**Attach a Railway volume** (for example at `/data`) so orders survive redeploys. Product prices start from `catalog.default.json`, and after that they are edited in `/admin`.
