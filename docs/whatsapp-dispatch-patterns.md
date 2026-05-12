# Noel Driver WhatsApp — Dispatch Pattern Analysis

Source: NOEL DRIVER group chat export (Feb 4 – Apr 25, 2026)
Participants: Scheule IBP Phone - Daniel (early), IBP SCHEDULE 2 (later), Noel Apeceche Elias, Miguel (vehicle maintenance), Moreira IBP Phone, Julian R (warehouse)

---

## How Tasks Are Dispatched

### Format (used consistently throughout)

```
*JOB NAME #NUMBER*
*ADDRESS* full street address + city + zip
*GATE CODE* code or NA
*SUP* @supervisor name
*TASK* what to do + exact material list
```

Later evolved to use labeled fields without asterisk formatting for some entries.

### Timing

- Next-day first task: typically sent between **7 PM and 11 PM** the night before
- Day-of tasks: sent **reactively** as each task completes — not pre-sequenced
- Noel regularly waits **15–60 minutes** between tasks asking "A donde voy ahora?"
- Some days, Noel starts without knowing anything after the first task

### Who Dispatches

- Feb–Mar: "Scheule IBP Phone - Daniel"
- Apr: "~ IBP SCHEDULE 2" (different person or phone) takes over
- Both use same format. The switch happened around March/April.

---

## Recurring Information Gaps (Things Noel Must Ask For)

These gaps cause delays, idle time, and wasted trips.

| Gap | Frequency | Impact |
|---|---|---|
| "A donde voy ahora?" / next task | Multiple times daily | Idle time between jobs |
| Gate code not included | Multiple instances | Noel arrives and can't enter — asks via chat (e.g., Apr 25: code #8020 for Moreno-Sanchez) |
| Zip code missing from supplier addresses | Repeated (Feb 13, others) | Noel can't navigate |
| Material type not specified | Several instances | Wrong product picked up (sand type, grout color, paver style) |
| Where to leave trailer | Repeated | Noel asks permission before parking |
| Delivery address for pickup material | Repeated | Noel picks up from supplier, then asks where to deliver |
| Supervisor contact at site | Occasional | No one there when Noel arrives |
| Trailer identity (which trailer) | Multiple | Several trailers in fleet — Noel unsure which one to take |

---

## Recurring Friction (Problems That Slow Operations)

### Equipment Failures
- **Trailer brake lockup** — happens repeatedly on multiple trailers ("las llantas se frenan"). Led to: driving with disconnected brake cables, return trips to warehouse, missed cleaning runs.
- **Hydraulic line leak on dump trailer** — Feb 12: couldn't dump, returned to warehouse; line replaced. 
- **Dead trailer battery** — Apr 13: couldn't lower dump trailer at landfill, needed jump start from roadside assistance ($100 charge, caused confusion about payment).
- **Tarp/cover not sealing** — material/debris falling on highway. Miguel (maintenance) handles repairs but they recur.
- **Truck vibration at 70 mph** — Feb 16: trailer causing vibration. Noel troubleshot by driving without trailer.

### Landfill Hours
- **Apopka dump** (3602 Golden Gem Rd): closes at **3:45 PM**. Noel has missed it multiple times.
- **Mid Florida Landfill**: used as primary dump. Further but possibly different hours.
- If a job site finishes filling the trailer in the afternoon, Noel can't dump and has to return dirty.

### Supplier Issues
- **First supplier doesn't have stock** (e.g., Feb 13: S&L Crusher at 2930 Eunice didn't have pebble 57 → went to 2908 Old Winter Garden Rd)
- **Wait time at suppliers**: 30–60 minutes for loading is common
- **Supplier address ambiguity**: Maps sends to wrong house number or nearby address
- **Keystone pickup order**: needed to go back to office to get order printed (Feb 11)

### Address/Navigation Problems
- Feb 18: Fazio job — Google sent to wrong house number on Citrus Leaf Blvd (builder job under construction, street addresses don't match GPS yet)
- Multiple instances: Noel confirms address by repeating it back before moving

### Load Capacity vs. Requirements
- Apr 22: Armony Dr job needed 5 TN base + 1 big bag sand — too heavy for one trip. Noel loaded 4.34 TN, had to split run. No pre-warning that this would happen.
- Large jobs (7 TN, 6 TN base) often require 2 trips.

---

## Task Type Frequency (Feb–Apr 2026)

| Task Type | Frequency | Notes |
|---|---|---|
| Material delivery (base/fines, sand) | Very high | Main daily work. Often 6–7 TN loads. |
| Trailer pickup + cleaning (landfill) | High | Often follows each material delivery |
| Material pickup from supplier | High | Keystone, Premier, Old Castle, Flagstone, S&L, Cemex |
| Small hardware/supply run | Medium | Home Depot/Lowe's for drains, pipe, cement bags, grout |
| Equipment delivery (machine + trailer) | Low-medium | Kubota SV75 closed cab, grappler, flat trailer |
| Pallet management | Medium | Empty pallet delivery/retrieval (e.g., Hearsey: 15 pallets) |
| Trailer repositioning (job-to-job) | Medium | Moving trailer between sites or warehouse |
| Coping delivery | Medium | Keystone, Flagstone Pavers (Brooksville — very far) |

---

## Supplier Directory (Where Noel Goes)

| Supplier | Address | Material | Notes |
|---|---|---|---|
| **S&L Crusher** | 2930 Eunice Ave, Orlando FL 32808 | Base/fines (heavy aggregate) | Primary base source. Also: 2908 Old Winter Garden Rd |
| **Cemex** | 4004 Clarcona Ocoee Rd, Orlando FL 32810 | Sand (5 TN bulk) | Used for bulk sand orders |
| **Keystone Tile Inc** | 4161 John Young Pkwy, Orlando FL 32804 | Coping tiles | PO# / SaleOrder# required. 30–60 min wait. |
| **Premier Hardscapes** | 3930 N Orange Blossom Trl, Orlando FL 32804 | Pavers (cubes) | PO# required. |
| **Flagstone Pavers Inc** | 9070 Old Cobb Rd, Brooksville FL 34601 | Coping | 60+ min each way — only for urgent coping pickup |
| **Old Castle** | 39 W Landstreet Rd, Orlando FL 32824 | Pavers | PO# required |
| **Pavers Depot** | 3150 36th St, Orlando FL 32839 | Pavers (pallets) | Wait for them to load |
| **Home Depot** | Various | Small items (pipe, drains, grout, cement, arena bags) | Good for 50 lb sand bags, drain hardware |
| **Lowe's** | Various | Sand (50 lb bags) | Backup when HD doesn't have |
| **Mid Florida Landfill** | (multiple locations) | Dump site | Used most frequently |
| **Apopka dump** | 3602 Golden Gem Rd, Apopka FL 32712 | Dump site | Closes 3:45 PM — hard constraint |

---

## Key Operational Rules Derived from Chat

### 1. Gate codes must be in the dispatch message
Gate codes asked for on arrival multiple times. Moreno-Sanchez (#8020), Terry Sewell (NA noted), etc. If not included upfront, Noel waits on site unable to enter.

### 2. Full day should be pre-sequenced the night before
Noel asks "Que hago ahora?" 3–5 times per day. Between each task he waits for the next message. A pre-planned route (Task 1 → Task 2 → Task 3) sent the night before would eliminate most of this idle time.

### 3. Landfill runs must be planned before 2:30 PM
Apopka closes at 3:45. If Noel is picking up a dirty trailer from a job site in the afternoon, plan the dump run before lunch, or route to Mid Florida (no hard close time known).

### 4. Load weight must match trailer type
5 TN is at or beyond some trailer limits. Dispatcher should know: flat trailer, dump trailer, and gooseneck each have different weight limits. Specify which trailer for which load.

### 5. Two-trip jobs need to be called out in the brief
If a job needs 7 TN base, plan for 2 separate runs. Noel shouldn't discover this on site.

### 6. Supplier pickup needs complete info: address + zip + PO/order number + quantity
Missing any of these causes delay or wrong pickup.

### 7. Next task must include where to deliver (after supplier pickup)
Noel sometimes picks up material and then asks where to take it. The dispatch message should always include the delivery destination.

### 8. Communicate trailer identity clearly
"Trailer rojo," "trailer azul," "trailer amarillo," "gooseneck" — Noel knows the trailers by color. Dispatch should specify which trailer to use.

---

## What a Good Dispatch Message Looks Like (Derived Standard)

Based on what works in the chat, a complete dispatch message includes:

```
*JOB NAME #NUMBER*

ADDRESS: [full address with zip code]
GATE CODE: [code or NA]
SUP: [supervisor name]

TRAILER: [color/type]

TASK:
1. [first action]
2. [second action, if needed]

MATERIAL:
- [item]: [quantity]
- [item]: [quantity]

NEXT STOP: [where to go after this, or "Warehouse" or "Home for the day"]
```

---

## What the Logistics Brief Should Add

Based on these patterns, the weekly logistics brief sent to the coordinator should include:

1. **Gate codes** for every gated community job that week — pulled from the dispatch sheet
2. **Supplier pickup details** (PO#, order#, address, quantity) when applicable — not just "pick up from Keystone"
3. **Two-trip flag** for jobs needing > 5 TN of material in one delivery
4. **Trailer assignment** (which trailer to use for which job, by color/type)
5. **Dump schedule** — which days need landfill runs, and whether timing allows Apopka (before 2:30 PM) or requires Mid Florida
6. **Pre-sequenced day plan** — full sequence of stops for each driver, not just job-by-job assignments
7. **Next-day pre-staging** — material that needs to be loaded the night before (already in brief, but confirmed by this analysis)

---

*This analysis is based on Noel's driver WhatsApp group chat, Feb 4 – Apr 25, 2026.*
*Use to improve logistics brief templates, dispatcher training, and route planning.*
