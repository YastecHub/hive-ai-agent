# 🐝 Hive - How it's used (Merchant & Buyer journeys)

This is the end-to-end guide for how people use Hive: a **merchant** going from the
landing page to running their entire store on WhatsApp, and a **buyer** discovering a
store, browsing products, and placing orders.

> **The Idea:** Hive is an autonomous AI employee that lives directly inside WhatsApp.
> Merchants run their store operations by chatting; buyers discover, inquire, and place
> orders by chatting. Hive automates catalogue curation, order processing, inventory reservation,
> customer relationship management, and live reporting.

---

## A) The Merchant Journey - from landing page to a running store

### 1. Discover (landing page)
The merchant lands on **Hive's site** and immediately sees the promise: *"Run your
buying & selling by chatting. Hive does the work."* They explore:
- **What is Hive** - an autonomous employee, not an app; lives in WhatsApp.
- **For Vendors** - the exact conversational commands ("add Ankara gown ₦18,500…").
- **Operations & Stock** - automated inventory tracking, low-stock warnings, instant order receipts.
- **Try the live demo** - interactive in-browser WhatsApp simulator.

CTA → **"Start on WhatsApp"** (opens a chat with the Hive business number).

### 2. Onboard (conversational setup)
The merchant messages the Hive number. Hive recognises a new business and sets it up conversationally:
- *"I sell fashion, my shop is Bella's Fashion Hub"* → Hive saves the business name,
  owner, and category (`update_business_profile`).
- *"We open Mon–Sat 9–7, we're in Surulere, delivery is ₦2,500 in Lagos"* → Hive
  saves the operational store info customers ask about (`update_store_info`).

### 3. Stock the store
- *"Add Ankara gown, ₦18,500, 12 in stock"* → product created immediately (`add_product`).
- **Or send a product photo** → Hive analyzes the image, drafts the name & description,
  and confirms price/stock (AI image onboarding).
- *"Restock gele by 20"*, *"change kaftan price to ₦26,000"*, *"remove silk scarf"* →
  inventory managed completely through chat (`adjust_inventory`, `update_product`, `remove_product`).

### 4. Run the store (day-to-day operations)
Everything happens via conversational messages:
- **Orders:** *"show open orders"*, *"mark HIVE-7Q2K9F as fulfilled/delivered"*
  (`list_orders`, `fulfill_order`), *"cancel order HIVE-9FS52Y"* (order cancelled + stock automatically restored).
- **Stock & Health:** *"how are sales?"*, *"what's low on stock?"* (`get_analytics`,
  `get_low_stock`).
- **Customers & Marketing:** *"who are my customers?"*, *"send a promo to inactive customers: 20% off this week"* (`list_customers`, `send_promotion`).
- **Support & Escalations:** Hive alerts the merchant when a customer expresses frustration, and they can review *"show open complaints"* (`list_support`).

### 5. Live Operations Dashboard
WhatsApp is where the day-to-day actions take place; the **web dashboard** is the real-time control console:
live revenue chart, order-volume breakdown, recent orders, top-selling products, top
customers, and inventory stock levels - updating in real time as orders are placed and fulfilled.

---

## B) The Buyer Journey - discovering a store and ordering

### 1. Reach Hive
A buyer messages the Hive number (from a store's link, social media profile, QR code, or flyer):
- Hive: *"Welcome to Hive! Which store would you like to shop from today?"* and
  presents store options.
- Buyer selects a store → Hive binds the session to that store (`choose_store`).

### 2. Browse & ask
- *"What do you sell?"* → interactive catalogue with descriptions, prices, and available stock (`list_products`).
- *"Do you deliver to Lekki? What time do you close?"* → answered accurately from the store's profile (`get_store_info`).
- Natural questions about sizing, materials, and availability are answered conversationally.

### 3. Order Placement & Inventory Reservation
- *"I want 2 Ankara gowns"* → Hive parses the intent, validates inventory, confirms the order,
  and decrements stock immediately (`place_order`).
- *"Actually make it 3"* / *"add a gele too"* → order updated and stock adjusted (`modify_order`).
- Customer receives an instant order reference and receipt:
  *"Order confirmed! HIVE-9FS52Y has been placed for 2 Ankara Gowns (Total: ₦37,000.00). Stock is reserved."*

### 4. After the Sale - Tracking, Cancellations & Support
- **Track:** *"what's the status of HIVE-9FS52Y?"* (`check_order_status`).
- **Cancellation:** *"cancel my order HIVE-9FS52Y"* → order marked CANCELLED and stock restored to inventory (`cancel_order`).
- **Customer Support:** If an issue or complaint arises, Hive responds with empathy, assists with resolution, and escalates to the merchant by logging a support ticket (`raise_support`).

---

## The Autonomous Commerce Loop

```
Buyer message → Hive AI (NLP & Tool Calling)
     → Order confirmed & inventory reserved in real-time
     → Stock decremented, order reference issued, receipt generated
     → Merchant alerted, live web dashboard updated instantly
     → (on cancellation) order marked CANCELLED, stock restored
```

Hive turns WhatsApp into a complete autonomous storefront: no complex apps for customers to download, no manual spreadsheet tracking for merchants, and zero human latency.
