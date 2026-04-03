# Self-Hosting Guide

This guide walks you through hosting your own instance of the Supply Chain Resilience Game from scratch. No prior Firebase experience is required.

---

## Prerequisites

Install these on your computer before starting:

1. **Node.js 22+** - Download from [nodejs.org](https://nodejs.org/). After installing, verify by opening a terminal and running:
   ```
   node --version
   ```
2. **Git** - Download from [git-scm.com](https://git-scm.com/).
3. **A Google account** - Needed to create a Firebase project.

---

## Step 1: Clone the Repository

Open a terminal and run:

```bash
git clone https://github.com/YOUR_USERNAME/supply-chain-resilience.git
cd supply-chain-resilience
```

Replace the URL with the actual repository URL.

---

## Step 2: Create a Firebase Project

1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project**.
3. Enter a project name (e.g., "Supply Chain Resilience").
4. You can disable Google Analytics (it is not used by this app). Click **Create project**.
5. Wait for the project to be created, then click **Continue**.

### Enable Authentication

1. In the Firebase Console, go to **Build > Authentication** in the left sidebar.
2. Click **Get started**.
3. Under **Sign-in method**, enable **Email/Password**.
4. Go back to Sign-in method and also enable **Anonymous** (this is used for players joining games).

### Enable Firestore

1. Go to **Build > Firestore Database** in the left sidebar.
2. Click **Create database**.
3. Select a location. **us-central1** is recommended (and matches the default configuration), but you can choose a region closer to your users.
4. Start in **Production mode** (the app includes its own security rules).
5. Click **Create**.

### Upgrade to Blaze Plan

Cloud Functions require the Firebase Blaze (pay-as-you-go) plan. For small classroom use, costs are typically within the free tier limits.

1. In the Firebase Console, click the **Upgrade** button (bottom of the left sidebar).
2. Select the **Blaze** plan and add a billing account.

> **Note:** You can set a budget alert (e.g., $5/month) under the Google Cloud Console to avoid surprise charges.

### Register a Web App

1. In the Firebase Console, go to **Project settings** (gear icon in the left sidebar).
2. Scroll down to **Your apps** and click the **Web** icon (`</>`).
3. Enter a nickname (e.g., "Supply Chain Game").
4. Check **Also set up Firebase Hosting** and select the default site.
5. Click **Register app**.
6. You will see a `firebaseConfig` object with your project's credentials. **Keep this page open** -- you will need these values in Step 4.

---

## Step 3: Install Dependencies

From the project root directory, run:

```bash
npm install
cd functions
npm install
cd ..
```

---

## Step 4: Configure Environment Variables

### Frontend Environment

1. Copy the example file to create your own:
   ```bash
   cp .env.local.example .env.local
   ```
2. Open `.env.local` in a text editor and fill in the values from the Firebase config you got in Step 2:

   ```
   VITE_FIREBASE_API_KEY=AIzaSy...your-api-key
   VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
   VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef123456
   VITE_ADMIN_EMAIL=your-admin-email@example.com
   ```

   The `VITE_ADMIN_EMAIL` is the email address you will use to sign in as the site administrator. Choose any email you control.

### Cloud Functions Environment

1. Create a file called `.env` inside the `functions/` folder:
   ```bash
   touch functions/.env
   ```
2. Add the following (use the same admin email as above):
   ```
   ADMIN_EMAIL=your-admin-email@example.com
   ```

   SMTP2GO settings will be added later in Step 6. The game works without email -- notifications are just skipped.

---

## Step 5: Update Firestore Security Rules

The security rules file contains a placeholder for the admin email that must be updated.

1. Open `firestore.rules` in a text editor.
2. Find this line:
   ```
   request.auth.token.email == 'ADMIN_EMAIL_PLACEHOLDER'
   ```
3. Replace `ADMIN_EMAIL_PLACEHOLDER` with the same admin email you used above:
   ```
   request.auth.token.email == 'your-admin-email@example.com'
   ```
4. Save the file.

---

## Step 6: Set Up Email Notifications (Optional)

Email notifications are sent when instructors apply for access and when their applications are approved or denied. If you skip this step, the game still works -- emails are simply not sent.

### Create an SMTP2GO Account

1. Go to [smtp2go.com](https://www.smtp2go.com/) and create a free account.
2. After signing in, go to **Settings > Sender Domains** or **Settings > Single Sender Emails**.
3. Add and verify a sender email address (e.g., `noreply@yourdomain.com`). If you don't have a domain, you can verify a single sender email address instead.

### Get Your API Key

1. In SMTP2GO, go to **Settings > API Keys**.
2. Click **Add API Key**, give it a name, and copy the key.

### Add SMTP2GO Settings to Functions Environment

Open `functions/.env` and add these lines:

```
ADMIN_EMAIL=your-admin-email@example.com
SMTP2GO_API_KEY=api-XXXXXXXXXXXXXXXXXXXXXXXX
SMTP2GO_SENDER=noreply@yourdomain.com
SMTP2GO_SENDER_NAME=Supply Chain Resilience
SMTP2GO_REPLY_TO=your-admin-email@example.com
```

| Variable | Description |
|---|---|
| `SMTP2GO_API_KEY` | The API key you copied from SMTP2GO |
| `SMTP2GO_SENDER` | The verified sender email address in your SMTP2GO account |
| `SMTP2GO_SENDER_NAME` | Display name shown in emails (defaults to "Supply Chain Resilience") |
| `SMTP2GO_REPLY_TO` | Where replies go when instructors respond to notification emails |

---

## Step 7: Install the Firebase CLI and Log In

1. Install the Firebase CLI globally:
   ```bash
   npm install -g firebase-tools
   ```
2. Log in to Firebase:
   ```bash
   firebase login
   ```
   This opens a browser window. Sign in with the same Google account you used to create the Firebase project.

3. Link this project to your Firebase project:
   ```bash
   firebase use --add
   ```
   Select your project from the list and give it an alias (e.g., "default").

---

## Step 8: Deploy

Deploy everything in this order:

### 1. Deploy Firestore Rules and Indexes

```bash
firebase deploy --only firestore
```

This uploads your security rules and creates the required database indexes.

### 2. Deploy Cloud Functions

```bash
cd functions
npm run build
cd ..
firebase deploy --only functions
```

This compiles and deploys all the backend logic. The first deploy may take a few minutes.

### 3. Build and Deploy the Web App

```bash
npm run build
firebase deploy --only hosting
```

After this completes, Firebase will print a **Hosting URL** (e.g., `https://your-project-id.web.app`). This is your game's public URL.

---

## Step 9: Create the Admin Account

1. Open your game's URL in a browser.
2. Click **Instructor Login**.
3. Click **Register** and create an account using the exact admin email you configured in Steps 4 and 5.
4. After registering, you will see a "pending approval" message. This is expected.
5. Go to the [Firebase Console](https://console.firebase.google.com/) > **Build > Firestore Database**.
6. Find the `instructors` collection and click on the document with your admin email.
7. Change the `status` field from `"pending"` to `"approved"`.
8. Go back to the game and refresh the page. You should now see the **Admin Dashboard** (since your email matches the admin email) and have full instructor access.

> For all future instructors, you can approve them directly from the Admin Dashboard without touching Firestore.

---

## Step 10: Verify Everything Works

1. **Admin Dashboard** - Sign in with your admin email. You should see the Admin Dashboard with sections for pending applications, instructors, and sessions.
2. **Create a session** - As an instructor, create a test game session.
3. **Join as a player** - Open the game URL in a private/incognito window. Enter the session code and a player name to join.
4. **Check email** (if configured) - Register a second instructor account. You should receive an email notification about the new application.

---

## Ongoing Costs

The game is designed to run within Firebase's free tier limits for typical classroom use (under ~100 concurrent students). The main cost drivers are:

- **Firestore reads/writes** - Each game round generates reads and writes per player.
- **Cloud Functions invocations** - Each player action triggers a function call.
- **Hosting bandwidth** - Serving the web app to students.

For a class of 30-50 students playing a 30-round game, expect costs well under $1 per session. Set up a [budget alert](https://cloud.google.com/billing/docs/how-to/budgets) in the Google Cloud Console if you want to monitor spending.

---

## Troubleshooting

### "Permission denied" errors in the game
- Double-check that the admin email in `.env.local`, `functions/.env`, and `firestore.rules` all match exactly (including capitalization).
- Make sure you deployed Firestore rules: `firebase deploy --only firestore:rules`

### Cloud Functions fail to deploy
- Ensure you are on the Blaze plan.
- Check that Node 22 is installed: `node --version`
- Try `cd functions && npm run build` to see if there are TypeScript errors.

### Emails are not being sent
- Check the Firebase Console **Functions > Logs** for `[EMAIL SKIP]` messages, which indicate missing SMTP2GO configuration.
- Verify that `SMTP2GO_API_KEY` and `SMTP2GO_SENDER` are set in `functions/.env`.
- Confirm your sender email is verified in your SMTP2GO account.

### Players cannot join a session
- Confirm that **Anonymous** authentication is enabled in the Firebase Console under Authentication > Sign-in method.

### "Index not found" errors
- Deploy indexes: `firebase deploy --only firestore:indexes`
- Indexes can take a few minutes to build. Check status in the Firebase Console under Firestore > Indexes.
