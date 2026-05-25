# CU Roofing — Inquiry Form Setup Instructions

This guide covers everything needed to deploy the inquiry form with Supabase, Twilio SMS, Gmail email, and Vercel.

---

## Overview

When a customer submits the inquiry form:

1. The inquiry is saved to **Supabase** (database)
2. An **SMS** is sent to the salesperson via **Twilio**
3. A **confirmation email** is sent to the customer via **Gmail**

---

## 1. Supabase Setup

### Create a project

1. Go to [supabase.com](https://supabase.com) → **Start your project** → sign in with GitHub
2. Click **New project** and fill in:
   - **Name:** `curoofing`
   - **Database Password:** create a strong password and save it
   - **Region:** `Canada (Central)`
3. Click **Create new project** — takes ~2 minutes

### Create the inquiries table

1. In your project, click **SQL Editor** in the left sidebar
2. Paste the contents of `supabase-setup.sql` and click **Run**
3. Confirm success, then go to **Table Editor** to verify the `inquiries` table exists

### Copy your credentials

Go to **Project Settings → API** and copy:

| Value                     | Environment Variable     |
| ------------------------- | ------------------------ |
| Project URL               | `SUPABASE_URL`           |
| `service_role` secret key | `SUPABASE_SERVICE_KEY`   |

> Use the **service_role** key, not the `anon` key.

---

## 2. Twilio Setup (SMS)

### Important — phone numbers explained

- **FROM number:** a Twilio-provisioned number (~$1.50 CAD/month) — you cannot use your personal cell
- **TO number:** the salesperson's existing mobile — no setup needed on their end

### Create a Twilio account

1. Go to [twilio.com](https://twilio.com) → **Sign up**
2. Verify your email and personal phone number
3. Answer onboarding questions: **Send SMS → Alerts & Notifications → Node.js**

### Buy a phone number

1. Go to **Phone Numbers → Manage → Buy a number**
2. Set filters: **Country:** Canada, **Capabilities:** SMS
3. Optionally search area code `416` or `647` (Toronto)
4. Click **Buy** and confirm (~$1.50/month)

### Copy your credentials

From the Twilio Console home page ([console.twilio.com](https://console.twilio.com)):

| Value                          | Environment Variable    |
| ------------------------------ | ----------------------- |
| Account SID (starts with `AC`) | `TWILIO_ACCOUNT_SID`    |
| Auth Token (click eye icon)    | `TWILIO_AUTH_TOKEN`     |
| Your Twilio number             | `TWILIO_FROM_NUMBER`    |
| Salesperson's mobile           | `TWILIO_TO_NUMBER`      |

> Phone numbers must be in E.164 format — `+1` followed by 10 digits, no dashes or spaces.
> Example: `+14168300685`

### Free trial restriction

On a free trial account, SMS can only be sent to **verified numbers**:

1. Go to **Phone Numbers → Verified Caller IDs**
2. Add the salesperson's number and verify it via the SMS code Twilio sends

Upgrade your account (add credit card + balance) to remove this restriction for production.

---

## 3. Gmail App Password Setup

### Enable 2-Step Verification

1. Sign into `curoofing.ca@gmail.com` and go to [myaccount.google.com](https://myaccount.google.com)
2. Click **Security** → **2-Step Verification** and follow the prompts to turn it on

### Generate an App Password

1. In **Security**, go to **App passwords** (or visit [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords))
2. Click **Create app password**, name it `CU Roofing Vercel`, click **Create**
3. Copy the 16-character password shown — Google only displays it once

| Value                     | Environment Variable  |
| ------------------------- | --------------------- |
| `curoofing.ca@gmail.com`  | `GMAIL_USER`          |
| 16-character App Password | `GMAIL_APP_PASSWORD`  |

---

## 4. Vercel Deployment

### Install and deploy

Run these commands in the project folder:

```powershell
npm install
npm install -g vercel
vercel
```

Answer the prompts:

- **Set up and deploy?** → `Y`
- **Link to existing project?** → `N`
- **Project name?** → `curoofing`
- **In which directory is your code?** → `./` (press Enter)
- **Want to override settings?** → `N`

### Add environment variables

Go to **vercel.com/dashboard → curoofing → Settings → Environment Variables** and add all eight:

```
SUPABASE_URL              https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY      eyJhbGci...

TWILIO_ACCOUNT_SID        ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN         your_auth_token
TWILIO_FROM_NUMBER        +14161234567
TWILIO_TO_NUMBER          +14168300685

GMAIL_USER                curoofing.ca@gmail.com
GMAIL_APP_PASSWORD        abcdefghijklmnop
```

After saving, redeploy so the function picks up the variables:

```powershell
vercel --prod
```

### Point curoofing.ca to Vercel

1. In Vercel, go to **Settings → Domains** and add `curoofing.ca` and `www.curoofing.ca`
2. Update these DNS records at your domain registrar (GoDaddy, Namecheap, etc.):

| Type    | Name  | Value                  |
| ------- | ----- | ---------------------- |
| `A`     | `@`   | `76.76.21.21`          |
| `CNAME` | `www` | `cname.vercel-dns.com` |

DNS changes take 10–30 minutes to propagate.

---

## 5. Admin Portal Setup

The admin portal lives at `curoofing.ca/admin.html` and lets you view, filter, search, and update all submitted inquiries.

### Step 1 — Run the updated SQL

In the Supabase SQL Editor, run the full `supabase-setup.sql` (or just the two new `CREATE POLICY` lines at the bottom). This grants authenticated admins read and update access to the `inquiries` table.

### Step 2 — Create your admin account

1. In Supabase, go to **Authentication → Users → Add user**
2. Enter your email and a strong password
3. Click **Create user**

### Step 3 — Fill in the config in admin.html

Open `admin.html` and find lines 155–156 near the bottom:

```js
const SUPABASE_URL  = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON = 'YOUR_SUPABASE_ANON_KEY';
```

Replace with your values from **Supabase → Project Settings → API**:

- `SUPABASE_URL` → Project URL
- `SUPABASE_ANON` → `anon` / public key (safe to put in HTML — RLS protects the data)

> The `anon` key is **not** the same as the `service_role` key. Use the `anon` key here.

### Step 4 — Deploy and access

After filling in the config, redeploy:

```powershell
vercel --prod
```

Then visit `curoofing.ca/admin.html` and sign in with the credentials you created in Step 2.

### What you can do in the admin portal

| Feature          | How                                                   |
| ---------------- | ----------------------------------------------------- |
| View inquiries   | Loads automatically after login, newest first         |
| Filter by status | Click **New / Contacted / Completed** buttons         |
| Search           | Type in the search box — matches name, phone, email   |
| See full details | Click any row to open a detail modal                  |
| Update status    | Use the dropdown in the Status column — saves instantly |
| Export to CSV    | Click **Export CSV** — downloads all visible rows     |
| Refresh          | Click **↺ Refresh** to reload latest from Supabase   |

---

## 6. Test the Form

1. Open `curoofing.ca/contact.html`
2. Fill in the form with your own name, phone, and email
3. Click **Send Inquiry** — within seconds you should see:
   - SMS received on the salesperson's phone
   - Confirmation email in the customer's inbox
   - A new row visible in the admin portal

---

## Reference — All Environment Variables

| Variable              | Where to find it                                    | Used in              |
| --------------------- | --------------------------------------------------- | -------------------- |
| `SUPABASE_URL`        | Supabase → Project Settings → API → Project URL     | Vercel + admin.html  |
| `SUPABASE_SERVICE_KEY`| Supabase → Project Settings → API → service_role key | Vercel only         |
| `SUPABASE_ANON_KEY`   | Supabase → Project Settings → API → anon key        | admin.html only      |
| `TWILIO_ACCOUNT_SID`  | Twilio Console home                                 | Vercel               |
| `TWILIO_AUTH_TOKEN`   | Twilio Console home (click eye icon)                | Vercel               |
| `TWILIO_FROM_NUMBER`  | Twilio → Phone Numbers → Active Numbers             | Vercel               |
| `TWILIO_TO_NUMBER`    | Salesperson's mobile in E.164 format                | Vercel               |
| `GMAIL_USER`          | `curoofing.ca@gmail.com`                            | Vercel               |
| `GMAIL_APP_PASSWORD`  | Google Account → Security → App passwords           | Vercel               |
