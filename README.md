# MediAssist PWA

![PWA](https://img.shields.io/badge/PWA-Ready-blue?style=for-the-badge)
![Offline](https://img.shields.io/badge/Offline-Supported-green?style=for-the-badge)
![Vanilla JS](https://img.shields.io/badge/JavaScript-Vanilla-yellow?style=for-the-badge)
![No Dependencies](https://img.shields.io/badge/Dependencies-None-lightgrey?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Active-success?style=for-the-badge)

MediAssist is a lightweight Progressive Web App built to manage patient visits quickly and efficiently.
It works offline, installs like a native app, and is designed for fast daily clinical use.

---

## ✨ Features

* Add new patient visits
* Offline support (Service Worker)
* Installable PWA (Mobile + Desktop)
* Fast loading with caching
* Simple, clean interface
* Works without internet after first load
* Lightweight (no frameworks)

---

## 🛠 Tech Stack

* HTML
* CSS
* Vanilla JavaScript
* Service Worker
* Web App Manifest

---

## 📦 Installation (Local)

Clone the repository:

```
git clone https://github.com/EllifeDash/med_pwa_app.git
```

Open project folder and run with a local server.

### Using VS Code Live Server

* Right click `index.html`
* Click **Open with Live Server**

### Using Python

```
python -m http.server
```

---

## 📱 Install as App (PWA)

1. Open in Chrome or Edge
2. Click **Install App**
3. App will work offline after first load

On mobile:

* "Add to Home Screen"

---

## 📁 Project Structure

```
.
├── index.html
├── sw.js
├── manifest.json
├── icons/
└── assets/
```

---

## ⚡ Offline Support

The app uses a Service Worker to cache core files for offline usage.
Cache version is managed manually inside `sw.js`.

```
const CACHE = 'mediassist-vX';
```

Update the version when making UI changes.

---

## 🚧 Future Improvements

* Patient search
* Data export
* Cloud sync
* UI enhancements
* Duplicate visit prevention
* Dark mode

---

## 🧠 Notes

* Clear cache if updates don't appear
* Designed to be dependency-free
* Optimized for low-resource environments

---

## 👨‍💻 Author

Built as a lightweight PWA for managing medical visits quickly and offline.

---

## ⭐ Support

If you find this useful, consider starring the repository.
