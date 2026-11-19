---
title: Ultrafast Local Browser Agent
date: 2026-11-17
summary: A fast browser agent that runs on a Macbook.
---

**Personal project; 2025-26**

Bro, a fast, browser agent that comfortably runs locally on a Macbook.

<figure>
<video controls playsinline preload="metadata" src="/bro/allrecipes.mp4">Bro and browser-use side by side on the same Allrecipes task.</video>
<figcaption>Find a vegetarian lasagna with 100+ reviews and 4.5+ stars. Left: Bro, answers in 14.9 s and 6 steps. Right: browser-use, runs out of steps after 73.9 s. Played at 4x; the timers show real seconds.</figcaption>
</figure>

---

## Context

- Browser use agents should be run locally to maximize privacy and security.
- The leading open source agent, browser-use, has the model write Python against the browser at every step. It's flexible, but every step is a lot slower.
- Bro is built around the opposite bet: the model sees a compact page and answers with one-line actions, and the harness takes care of the rest.
- Task: beat browser-use on the same local model, same laptop and same 150 [Emergence WebVoyager](https://github.com/EmergenceAI/EmergenceWebVoyager) tasks.*

**The 150 tasks are a fixed slice of the total 535 (first 10 per website), chosen before any run happened, and judged by an LLM (Gemini 2.5 Flash). Running all 535 on browser-use on my Mac was too time prohibitive.*

---

## Results

Both agents ran Qwen3.6-35B-A3B (2-bit, served by [Splash](https://github.com/incoai/splash), the fastest Qwen-specific Apple engine, under a 12 GB cap) on an M4 Max with 36 GB, in headless Chrome, with 25 steps and 240s per task, scored by the same LLM judge.

| | solved | median per task | median on a solved task | solved within 30 / 60 / 120 s | all 150 tasks |
|---|---|---|---|---|---|
| **Bro, with screenshot checks** | **74 / 150** | 46.3 s | **28.5 s** | **38 / 58 / 73** | **2.0 h** |
| Bro, text only | 70 / 150 | **43.7 s** | 33.9 s | 30 / 53 / 70 | **2.0 h** |
| browser-use 1.0.3, thinking on | 53 / 150 | 113.0 s | 111.7 s | 2 / 7 / 31 | 4.9 h |
| browser-use 1.0.3, thinking off | 48 / 150 | 99.6 s | 96.2 s | 1 / 5 / 38 | 4.5 h |

- On the 30 tasks both solved, browser-use took a median 3.3x as long.
- On all 535 Emergence WebVoyager tasks, fully local, Bro solves 242 (45.2%) at a median 45.6 s per task. The frontier agent (OpenAI's Operator) scores 69% at a median 93s per task.

<figure>
<video controls playsinline preload="metadata" src="/bro/booking.mp4">Bro and browser-use side by side on the same Booking.com task.</video>
<figcaption>A hotel search with dates and filters on Booking.com. Bro passes in 70.0 s; browser-use fails after 138.9 s.</figcaption>
</figure>

---

## How I did it

Per step, Bro reads ~2,000 tokens and writes ~41, against ~7,300 and ~178 for browser-use. These are the improvements I made over browser-use:

- One-line actions: `click 12`, `type 7 "lasagna"`, `scroll down`, `done "..."`, up to three per turn. No JSON, code, or reasoning tokens.
- Fast page structure view-capture: One JavaScript pass collects the visible text in reading order and the interactive elements with stable ids; new elements are starred.
- A feedback loop that saves steps: Every action is checked for its effect. Elements that do nothing twice disappear, two stalled steps trigger a replan, and four return to the start page.
- Event-based settling: Wait for the DOM and network to go quiet, usually under 100 ms, instead of fixed sleep.
- Browser plumbing: One reused Chrome tab, ads and trackers blocked, and clicks on overlays retried.
- Passing the model a screenshot at the end to verify completion, and after two steps of being stuck on an unchanged page. I opted not to pass screenshots per step because it would add ~3600 tokens per image, which would slow down the model.

## Works while you work

A 4-bit MoE model uses ~21 GB on a 36 GB machine, and wouldn't allow users to do any other work simultaneously. I use a 2-bit build (12 GB) that streams cold experts from SSD at no accuracy loss on tasks.

---

## What failed

- Complimenting Bro with system 1 models such as OpenJev and Laya, picking actions from a menu without calling the planner failed due to lack of accuracy.




---

## Links

- [GitHub repo](https://github.com/cyan-ding/bro)
- [Lab notebook](https://github.com/cyan-ding/bro/blob/main/LABNOTEBOOK.md)
- [Emergence WebVoyager](https://github.com/EmergenceAI/EmergenceWebVoyager)
