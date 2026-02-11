# XV Riigikogu Mobile Dashboard

📱 **Mobile-optimized parliamentary analysis tool for the Estonian Parliament (XV Riigikogu)**

![Estonian Parliament](https://img.shields.io/badge/XV_Riigikogu-2023--2027-blue)
![Mobile Optimized](https://img.shields.io/badge/Mobile-Optimized-green)
![PWA Ready](https://img.shields.io/badge/PWA-Ready-purple)

## 🔗 Live Demo

**Mobile App:** [https://igorljapin.github.io/riigikogu-mobile/](https://igorljapin.github.io/riigikogu-mobile/)

**Desktop Version:** [https://igorljapin.github.io/riigikogu-desktop/](https://igorljapin.github.io/riigikogu-desktop/)

---

## ✨ Features

### 📊 Parliamentary Composition
- **101 Members of Parliament** with photos and profile links
- **Coalition vs Opposition** breakdown (52 vs 49 seats)
- **7 Political Parties:** Reform (39), SDE (14), Eesti 200 (13), Isamaa (11), EKRE (10), Center (8), Independent (6)
- Real-time majority indicator (51 seats threshold)

### 🗳️ Vote Calculator
- Interactive coalition builder
- Add/remove entire parties with one tap
- Add/remove individual MPs
- Visual threshold indicators (simple majority, constitutional majority)
- Mobile-friendly bottom sheet design

### 👥 MP Directory
- Complete list of all 101 MPs
- Photos and official Riigikogu profile links
- Party affiliation with color coding
- Committee assignments
- Search and filter functionality

### 🏛️ Board of the Riigikogu
- President: Lauri Hussar (Eesti 200)
- First Vice-President: Toomas Kivimägi (Reform)
- Second Vice-President: Jüri Ratas (Center)

### 🇺🇸 Estonia-USA Parliamentary Friendship Group
- Filter to show group members
- Leadership positions highlighted

### 📱 Mobile-First Design
- Touch-optimized interface
- Bottom sheet navigation
- Swipe gestures support
- No horizontal scrolling required
- Simplified party-block seating view

---

## 📲 Installation (Add to Home Screen)

### iPhone / iPad (Safari)

1. Open [https://igorljapin.github.io/riigikogu-mobile/](https://igorljapin.github.io/riigikogu-mobile/) in Safari
2. Tap the **Share** button (square with arrow)
3. Scroll down and tap **"Add to Home Screen"**
4. Tap **"Add"** in the top right
5. App icon appears on your home screen

### Android (Chrome)

1. Open [https://igorljapin.github.io/riigikogu-mobile/](https://igorljapin.github.io/riigikogu-mobile/) in Chrome
2. Tap the **menu** (⋮) in the top right
3. Tap **"Add to Home screen"** or **"Install app"**
4. Confirm by tapping **"Add"**
5. App icon appears on your home screen

### Benefits of Installing
- Opens in full-screen mode (no browser UI)
- Works offline after first load
- Faster launch from home screen
- App-like experience

---

## 🗂️ Data Structure

### Current Coalition (52 seats)
| Party | Seats | Color |
|-------|-------|-------|
| Reform | 39 | 🟨 Yellow |
| Eesti 200 | 13 | 🟦 Cyan |

### Current Opposition (49 seats)
| Party | Seats | Color |
|-------|-------|-------|
| SDE | 14 | 🟥 Red |
| Isamaa | 11 | 🟦 Blue |
| EKRE | 10 | 🟫 Brown |
| Center | 8 | 🟩 Green |
| Independent | 6 | ⬜ Gray |

---

## 🛠️ Technical Details

- **Framework:** React with Tailwind CSS
- **Build:** Vite (minified single-file HTML)
- **Hosting:** GitHub Pages
- **PWA:** Service Worker for offline support
- **Data:** Static JSON (January 2026)

### File Structure
```
riigikogu-mobile/
├── index.html          # Main application
├── manifest.json       # PWA manifest
├── service-worker.js   # Offline support
├── favicon.ico         # App icon
├── icon-192.png        # PWA icon (192x192)
├── icon-512.png        # PWA icon (512x512)
└── README.md           # This file
```

---

## 📊 Voting Thresholds

| Type | Seats Required | Description |
|------|----------------|-------------|
| Simple Majority | 51 | Regular legislation |
| Constitutional Majority | 61 | Constitutional amendments |
| Two-Thirds | 68 | Special procedures |

---

## 🔄 Updates

Data is current as of **January 2026**. The dashboard reflects:
- Current party affiliations
- Committee assignments
- Leadership positions
- Coalition/opposition status

---

## 🔗 Related Projects

- **Desktop Version:** [riigikogu-desktop](https://github.com/igorljapin/riigikogu-desktop) — Full-featured version optimized for desktop displays

---

## 📜 Data Sources

- [Riigikogu Official Website](https://www.riigikogu.ee/)
- [Riigikogu Open Data API](https://api.riigikogu.ee/)

---

## 🙏 Acknowledgments

- Estonian Parliament (Riigikogu) for open data
- All 101 Members of the XV Riigikogu

---

## 📄 License

MIT License — Free to use and modify.

---

## 👤 Author

**Igor Ljapin**

- GitHub: [@igorljapin](https://github.com/igorljapin)

---

*XV Riigikogu Interactive Dashboard • Data: January 2026*
