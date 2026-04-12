# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-04-12

### Added
- Creature harvesting system with skill-based DC checks across 14 creature types
- Layered table lookup: actor flag override, exact name match, normalized name, generic type+CR fallback
- Appraisal system for previewing harvestable materials before committing
- Critical success (Nat 20 bonus items) and critical failure (creature-specific effects) on harvest rolls
- Harvest ruin mechanic (fail by 5+ permanently ruins the harvest)
- Retry system with reduced tier ceiling on marginal failures
- 250+ harvestable items across material, food, component, and trophy categories
- 37 creature-specific harvest tables (wolf, dragon, beholder, troll, etc.)
- 56 generic harvest tables (14 creature types x 4 CR tiers)
- Foraging system with 10 environments, weather/season modifiers, and cumulative tier rewards
- 40 foraging tables (10 environments x 4 tiers including Rare)
- Foraging failure events table with 10 random consequences (damage, exhaustion, debuffs)
- GM Foraging Panel for configuring environment, weather, season, and skills
- "Arm Next Failure" checkbox for GM-controlled failure event triggers
- Auto-applied ActiveEffect debuffs for persistent foraging penalties
- Spoilage system with shelf life tracking and item sheet integration
- Token indicators for harvest state (harvested, ruined, items available)
- GM context menu for assigning harvest tables and resetting harvest state
- Cross-ownership support via optional socketlib integration
- Configurable skill mappings, DC offsets, value multipliers, and pickup dialogs
- Compendium folder organization with VTTools branding
- Full i18n support (English)

[1.0.0]: https://github.com/AntTheGM/gmants-ultimate-harvester/releases/tag/v1.0.0
