# Campaign & Skill Tree

## Structure

```
Campaign
├── Chapter 1  "First Light"      (sequencing)
├── Chapter 2  "Rows"             (repeat / for loops)
├── Chapter 3  "Ripe or Not"      (conditionals, sensors)
├── Chapter 4  "Until Done"       (while, booleans)
├── Chapter 5  "Ledger"           (variables, arithmetic)
├── Chapter 6  "Your Own Commands"(functions)
├── Chapter 7  "Inventory"        (lists, for-in)
├── Chapter 8  "Market Sense"     (combining sensors, strategy)
├── Chapter 9  "Order Matters"    (sorting, nested loops)
└── Chapter 10 "Second Drone"     (spawn: concurrency basics)
```

Each chapter contains:
- **3–5 contracts.** Objectives with a cycle budget, e.g. *"Harvest 20 radishes within 4,000 cycles"*.
- **One "aha" lesson.** An interactive explanation shown when the chapter's concept unlocks, with an editable example.
- **An optional ★★★ challenge.** The same contract with a tighter budget or a shorter-code target, for wallet credits and a badge.

Contract rewards: wallet credits plus XP. First completion also unlocks the next contract.

## Skill tree

The skill tree is a DAG. Nodes cost **farm credits** and require prerequisite nodes or a completed chapter.

```mermaid
flowchart LR
  subgraph Language
    L1[repeat] --> L2[for i in range]
    L2 --> L3[if / else]
    L3 --> L4[while]
    L3 --> L5[and / or / not]
    L4 --> L6[variables]
    L6 --> L7[def functions]
    L7 --> L8[return values]
    L8 --> L9[lists]
    L9 --> L10[for x in list]
    L10 --> L11[dicts]
    L8 --> L12[spawn second drone]
  end
  subgraph Commands
    C1[move/plant/harvest] --> C2[till]
    C2 --> C3[water/refill]
    C3 --> C4[moisture sensor]
    C1 --> C5[is_ripe sensor]
    C5 --> C6[price sensor]
    C6 --> C7[sell]
    C4 --> C8[measure]
  end
  subgraph Farm
    F1[4x4] --> F2[6x6] --> F3[8x8] --> F4[10x10] --> F5[12x12]
    R1[Rotor I] --> R2[Rotor II] --> R3[Rotor III]
    S1[Sprayer]
  end
  subgraph Crops
    K1[Radish] --> K2[Corn] --> K3[Melon]
    K3 --> K4[Tomato vine]
    K3 --> K5[Rice]
    K5 --> K6[Lavender]
    K6 --> K7[Sunroot]
    K7 --> K8[Heirloom gourd]
  end
  L3 -.requires.-> C5
  C2 -.requires.-> K2
  C3 -.requires.-> K3
```

### Node design rules

- **Language nodes are gated by chapter**, not just credits, so the curriculum order is preserved. You can't buy `while` before Chapter 4.
- **Farm, drone and crop nodes are credits-only.** This is the "upgrade your farm" fantasy.
- Every language node unlock opens a **lesson card** with the new syntax and a runnable example that edits the player's current program, not a blank one.
- Before a builtin that "does work for you" unlocks (e.g. `goto(x, y)`), the player first writes it themselves in a contract. Then it unlocks as a cheaper native builtin. *You earn the shortcut by understanding it.*

## Saves

- Autosave on every run end, every contract completion, every purchase, and every 30 s while editing.
- Multiple program "files" per save (tabs in the editor), max 10 files of 16 KB each.
- One campaign save slot per account in v1. Three slots are possible later.
- Details: [saves-and-persistence](../03-architecture/saves-and-persistence.md).

## Free Farm (idle layer)

Outside contracts, the player's farm (size from the skill tree) runs their chosen program **while the tab is open**. Sales earn farm credits at the real simulation rate. There are no offline earnings in v1, because that needs a server-side simulation per user and costs real compute. Every Free Farm session submits a **run receipt** (program, seed, start state, cycles run) that the server re-simulates before crediting. See [security-anti-cheat](../03-architecture/security-anti-cheat.md).
