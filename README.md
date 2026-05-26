# CU Roofing — curoofing.ca

Affordable, efficient & trustworthy roofing contractor serving the Greater Toronto Area.

## About

CU Roofing is a B2B & B2C roofing service contractor offering a full range of licensed roofing services in the GTA — including shingle replacement, flat roofs, roof repairs, renovations, and residential & commercial roofing. The business is backed by $2,000,000 liability insurance, provincial high-altitude certified workers, and a 10-year workmanship warranty.

## Features

- **Inquiry Form** — customers submit roofing inquiries with address, phone, and project details
- **SMS Alerts** — new inquiries trigger an instant SMS to the sales team via Twilio
- **Email Confirmation** — customers receive a branded confirmation email via Gmail
- **Admin Dashboard** — internal portal to view, search, filter, and update inquiry statuses
- **CSV Export** — one-click export of all inquiries for reporting

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS (Bootstrap 4), vanilla JavaScript |
| Backend / API | Vercel Serverless Functions (Node.js) |
| Database | Supabase (PostgreSQL) |
| SMS | Twilio |
| Email | Nodemailer + Gmail App Password |
| Hosting | Vercel |
| Domain | curoofing.ca |

## Project Structure

```
├── index.html           # Main landing page
├── contact.html         # Customer inquiry form
├── admin.html           # Admin dashboard (login required)
├── api/
│   └── submit-inquiry.js  # Serverless function: saves inquiry, sends SMS & email
├── css/                 # Stylesheets
├── js/                  # JavaScript libraries
├── images/              # Site images and logos
├── supabase-setup.sql   # Database schema and seed data
├── .env.example         # Environment variable template
└── vercel.json          # Vercel deployment configuration
```

## Environment Variables

Copy `.env.example` to `.env` and fill in the values before deploying.

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (server-side only) |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_FROM_NUMBER` | Twilio outbound phone number |
| `TWILIO_TO_NUMBER` | Salesperson mobile number(s) for SMS alerts |
| `GMAIL_USER` | Gmail address for sending confirmation emails |
| `GMAIL_APP_PASSWORD` | Gmail app password (16-char, from Google Account security settings) |

## Setup

1. Run `supabase-setup.sql` in your Supabase SQL Editor to create the `inquiries` and `users` tables
2. Add all environment variables in the Vercel dashboard
3. Connect the GitHub repo to Vercel for automatic deployments on push to `main`
4. Point `curoofing.ca` DNS to Vercel (`A` record → `76.76.21.21`)

## Contact

- Phone: (416) 830-0685
- Email: CURoofing.ca@gmail.com
- Address: 19 Ashridge Dr., Toronto, ON M1V 1P1
