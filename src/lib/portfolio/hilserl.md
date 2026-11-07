---
title: RL to Plug in Chargers
date: 2026-01-31
summary: Human-in-loop soft actor-critic on a SO-101 .
---

**Physical AI Hackathon; 31 Jan-1 Feb 2026** 

Bruce Kim, Siddharth Saha, Cyan Ding, Indraneel Patil.

2 days to train a robot policy to plug in a charger.

<figure class="portrait">
<video controls playsinline preload="metadata" src="/hilserl/teleop.mp4">Teleoperating the leader while the follower approaches the charger.</video>
<figcaption>Online RL happening live. Our setup consists of an overhead light/camera, and the charger is held in place with a 3d-printed mount.</figcaption>
</figure>

---

## Context

- Datacenters need maintenance when cables disconnect. We train robots for this task. 
- Soft actor-critic paired with human intervention has been shown to bootstrap and speed up the training process sample-efficiently. 
- Online RL has traditionally been more viable than offline in preventing distributional shift, which we believed was important for this task. 
- Task: Train a SO-101 using human-in-loop SAC to insert a USB charger into a power strip.

<figure>
<img src="/hilserl/actor-learner-diagram.png" alt="Diagram of the actor process on the robot and the learner process with replay buffers, linked by gRPC." />
<figcaption>The actor outputs a probability distribution of actions, while the learner predicts expected cumulative reward. Parameters are sent one way over gRPC, while transitions and human interactions go the other way.</figcaption>
</figure>

---

## What we built


- We fork the LeRobot repo, which contains all the RL infra out of the box, and add the capability for a person to take control of the leader mid-episode, give back control back to the policy, and mark whether the run succeeded.
- The leader reports joint angles. We modify the infra with forward kinematics to convert observations to x, y, z coordinates, which is what the policy uses to train. 
- Our setup included an overhead camera mounted to pvc pipes, a 3d-printed mount for the power strip, all mounted onto a wooden board. 


---

## An episode


<figure>
<video controls playsinline preload="metadata" src="/hilserl/episode.mp4">One logged episode, top camera beside the wrist camera, of the arm plugging in the charger.</video>
<figcaption>An example of an episode that enters the replay buffer. Top camera on the left, wrist camera on the right.</figcaption>
</figure>

## Setup configuration

<figure class="pair">
<img src="/hilserl/hilserl1.webp" alt="Power cable plugged into a strip lying flat, with the cable running up and off the table." />
<img src="/hilserl/hilserl2.webp" alt="Power cable held at the gripper, with the strip standing upright." />
<figcaption>Two configurations of the power cable; we try both to see which is easier for the policy.</figcaption>
</figure>

---

## Takeaways

- We continuously ran into hardware issues, such as the camera timing out or the leader/follower not syncing.
- We also ran into issues with the training constantly being interrupted, and we weren't able to resolve this by the end of the hackathon. 
- Overall, we were not able to successfully record an instance where the policy plugs in the charger. 

___

## Links

- [HIL-SERL paper](https://arxiv.org/abs/2410.21845)
- [LeRobot fork](https://github.com/indraneelpatil/lerobot)
- [Episode dataset](https://huggingface.co/datasets/brucekimrok/real_robot_plug_charger_20_episodes)
