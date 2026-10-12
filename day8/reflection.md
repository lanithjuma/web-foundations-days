<!--
  NOTE TO SELF BEFORE SUBMITTING:
  This is a draft/starting point, not your real reflection. I don't know what
  you personally found hardest, what feedback you actually received on your
  capstone, or what you're planning to learn next — those are the sections
  below that need your own honest answers. Replace the bracketed parts, keep
  or rewrite the rest, and make sure the final version is 150-300 words and
  actually true for you before you submit it.
-->

# Day 8 Reflection

The most difficult concept for me in this course was reasoning correctly
about concurrency — specifically, understanding why "check if something is
available, then update it" is unsafe when two requests can run at the same
time, even though it reads like perfectly ordinary code. It took working
through the ticket double-booking problem concretely, writing out the exact
interleaving where two users both pass the check before either write
happens, to really see the race condition rather than just take it on faith.
What helped was learning to think in terms of single atomic database
operations — a conditional `UPDATE` or a transaction — instead of multiple
separate steps that *look* atomic but aren't.

[Replace this paragraph with what you'd actually improve about your
capstone, based on feedback you received — for example, if a reviewer
pointed out your estimates didn't account for a peak-within-the-peak, or
that your architecture diagram was missing a caching layer, or that a
trade-off needed a clearer "why," name that specifically here.]

Next, I want to go deeper into how real systems implement the pieces I only
described at a high level in this design — particularly how a virtual
waiting room is actually built (queueing technology, how admission rate is
tuned), and how distributed transactions and database replication work
under the hood, since I relied on those as "the database just handles it"
without fully understanding the mechanics.

[Word count check: aim for 150–300 words total once you've filled in your
own paragraph above.]
