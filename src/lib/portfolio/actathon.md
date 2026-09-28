---
title: Autonomous Excavators
date: 2026-09-27
summary: Fine-tuning pi 0.7 to deploy on a real Takeuchi mini excavator.
---

**Act-athon hackathon; 26–27 Sep 2026**

2 days, fine tune pi 0.7 to deploy on a real Takeuchi mini excavator.

---

## Context

- The excavator is driven through five joystick channels (swing, boom, arm, bucket, thumb).
- There is no joint feedback and the only "state" is the last command sent.
- We interface with the excavator using a raspberry pi, which can write joint deltas.
- Task: pick up a traffic cone with the bucket and thumb and place it on a marked square.

---

## What we tried

### 1. MuJoCo sim design

- We had a .obj file that could be decomposed into tracks, cab, boom, stick and bucket.
- We hinged the robot's joints in sim using pin centroids found inside the .obj mesh.
- To actually carry the cone, we built a concave bucket from seven fitted collision plates and a thumb plate.
- To more accurately bridge sim-to-real, we tried to mimic the real machine: dead band, rate limit, firstorder lag, 0.5 s gate hold.
- We placed cameras by iterating/triangulating against real frames: two roof-mounted C270s that swing with the house, plus a tripod camera.
- For collecting episodes in sim, we also needed a photorealistic background for image rendering. We obtain a 3DGS of the parking lot, and combine it with MuJoCo renders.



### 2. Policies tested in sim

We develop and train a variety of policies in the sim while collecting episodes.


| policy           | method                                                                                                                               | success                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| Scripted expert  | Phase controller, damped-least-squares IK on the bucket, human-like style randomisation (partial sticks, pauses, phase-order jitter) | **92 %**                             |
| Learned policy   | DAgger from the expert, 8-step history, success-filtered aggregation                                                                 | **60 %**                             |
| PPO from scratch | Curriculum over grasp difficulty                                                                                                     | ~1 %                                 |
| Image-based RLPD | SAC seeded with the teleop replay buffer                                                                                             | 0 % (too slow in the time available) |




### 3. Deployment

- The policies trained on sim did not perform well. Our demo ended up being a teleop mixture containing full task completions, DAgger interventions, and fine grained gripper data.
- We fine tuned pi 0.7 on PI's servers using their API.
- We run a small server on the raspberry pi to interface between the pi 0.7 inference and observations collected on the excavator.

---



## Takeaways

- Sim-to-real did not transfer on the machine. Likely cause: sim commands are smoother and smaller than what the real hydraulics need (dead band, pulsed human lowering), so the policy's actions fall below the actuation threshold.
- Cross embodiment and lack of state was hard to bridge. Pi 0.7 was proclaimed to be trained on various embodiments. The excavator was basically a big So101 Arm; the model still performed poorly zero shot. Without motor encoders, the policy functioned as a vision model; most of the actions in training data had low informational value.
