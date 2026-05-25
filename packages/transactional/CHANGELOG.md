# @cms0/transactional

## 0.2.21

### Patch Changes

- 6fd3ac1: Resume core package publishing from the recovered self-hosted release train.
- Updated dependencies [6fd3ac1]
  - @cms0/shared@0.2.21

## 0.2.20

## 0.2.19

## 0.2.18

## 0.2.17

## 0.2.16

## 0.2.15

## 0.2.14

### Patch Changes

- e76b090: Republish the public runtime stack with a single compatibility boundary so
  Canvas, shared helpers, admin, and SDK packages cannot drift into broken
  published combinations.

## 0.0.3

### Patch Changes

- d131093: Harden npm package publication by rebuilding tarballs during `prepack` and verifying packed artifacts in the main-branch release workflow. This fixes missing build output in published Canvas packages and corrects the transactional package entrypoint paths used by consumers.

## 0.0.2

### Patch Changes

- bef5ec7: Ensure the admin server binary is executable in Docker images.
- 2ee81b6: Fix rich text editor transaction sync issues and stabilize localized field test behavior.
