#!/usr/bin/env python3
"""
Extract creature names from Tomb of Annihilation text and cross-reference
with OhhLoz and Hamund harvester tables.
"""

import re
import csv
from collections import defaultdict
from difflib import SequenceMatcher

def similarity_ratio(a, b):
    """Calculate similarity between two strings (0-1)"""
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()

def fuzzy_match(creature_name, table_names, threshold=0.85):
    """Find fuzzy matches in a list of names"""
    matches = []
    creature_lower = creature_name.lower()

    # First try exact match (case insensitive)
    for name in table_names:
        if creature_lower == name.lower():
            return [(name, 1.0)]

    # Then try fuzzy matching
    for name in table_names:
        ratio = similarity_ratio(creature_name, name)
        if ratio >= threshold:
            matches.append((name, ratio))

    # Sort by similarity
    matches.sort(key=lambda x: x[1], reverse=True)
    return matches

def extract_toa_creatures(text_file):
    """Extract creature names from ToA text file"""
    creatures = set()

    with open(text_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Split by page markers
    pages = content.split('=== PAGE')

    # Look for Appendix D (starts around page 210)
    in_appendix_d = False

    for page in pages:
        lines = page.split('\n')

        # Check if we're in Appendix D
        if 'APPENDIX D' in page and 'MONSTERS' in page:
            in_appendix_d = True

        if in_appendix_d:
            # Look for stat blocks - identified by creature type line followed by Armor Class
            for i, line in enumerate(lines):
                line_clean = line.strip().replace('→', '')

                # Look for creature type line (Small/Medium/Large/etc creature_type, alignment)
                type_match = re.match(r'^(Tiny|Small|Medium|Large|Huge|Gargantuan)\s+(aberration|beast|celestial|construct|dragon|elemental|fey|fiend|giant|humanoid|monstrosity|ooze|plant|undead)', line_clean, re.IGNORECASE)

                if type_match:
                    # Found a creature type line
                    # Look backwards for the creature name (should be within 3 lines before)
                    for k in range(max(0, i-3), i):
                        potential_name = lines[k].strip().replace('→', '')

                        # Skip empty lines, page numbers, headers
                        if not potential_name or re.match(r'^\d+$', potential_name):
                            continue

                        # Skip common non-name text
                        skip_patterns = [
                            r'^(armor class|hit points|speed|str|dex|con|int|wis|cha)$',
                            r'appendix',
                            r'monsters? and npcs?',
                            r'^\d+ ===$',
                            r'^=== page',
                            r'^actions?$',
                            r'^legendary actions?$',
                            r'\blevel\b',
                            r'\bslots?\b',
                            r'^[0-9]+[a-z]+\s+level',  # "2nd level", "3rd level"
                            r'hit points',
                            r'saving throw',
                            r'\."\s*$',  # ends with period quote
                            r'^[^a-zA-Z]+$',  # only symbols/numbers
                            r'castes?\)',
                            r'^\.\.',
                        ]

                        if any(re.search(pattern, potential_name, re.IGNORECASE) for pattern in skip_patterns):
                            continue

                        # Skip if contains "Hit:" (action description)
                        if 'Hit:' in potential_name or 'hit:' in potential_name or 'hit points' in potential_name.lower():
                            continue

                        # Skip if it looks like a sentence (ends with period, has many words)
                        if potential_name.endswith('.') or potential_name.endswith('.")') or potential_name.count(' ') > 6:
                            continue

                        # Must have at least one letter
                        if not re.search(r'[a-zA-Z]', potential_name):
                            continue

                        # Skip obvious non-creature words
                        non_creature_words = ['chapter', 'arrival', 'welcome', 'expedition', 'begins',
                                             'things to do', 'side quests', 'denizens', 'villa', 'city']
                        if any(word in potential_name.lower() for word in non_creature_words):
                            continue

                        # This looks like a creature name
                        creature_name = potential_name.strip()

                        # Skip if too long or too short
                        if len(creature_name) > 50 or len(creature_name) < 3:
                            continue

                        # Clean up all-caps names
                        if creature_name.isupper() and len(creature_name) > 3:
                            # Convert to title case
                            creature_name = ' '.join(word.capitalize() for word in creature_name.split())

                        creatures.add(creature_name)
                        break

    # Also look in the Contents page for creature index
    contents_creatures = extract_from_contents(content)
    creatures.update(contents_creatures)

    return sorted(creatures)

def extract_from_contents(content):
    """Extract creature names from contents/index"""
    creatures = set()

    # Look for appendix listings
    lines = content.split('\n')
    for i, line in enumerate(lines):
        # Look for lines that reference page numbers for monsters
        # Usually format like "Giant Snapping Turtle .................... 222"
        if re.search(r'\.\.\.\.\.\.\s*\d{2,3}', line):
            # Extract the part before the dots
            match = re.match(r'([A-Z][^\.]+?)\s*\.\.\.', line)
            if match:
                creature_name = match.group(1).strip()
                # Clean up
                creature_name = re.sub(r'^→', '', creature_name).strip()

                # Skip common non-creature entries
                skip_words = ['chapter', 'appendix', 'level', 'introduction', 'conclusion',
                              'history', 'location', 'getting', 'exploring', 'schemes',
                              'encounters', 'items', 'spirits', 'tomb', 'vault', 'chamber',
                              'dungeon', 'cradle', 'gear', 'hall', 'temple', 'flora', 'fauna',
                              'pirates', 'patients', 'captives', 'arrival', 'welcome', 'begins',
                              'denizens', 'villa', 'things', 'side', 'quest', 'city', 'forbidden']

                if any(skip.lower() in creature_name.lower() for skip in skip_words):
                    continue

                # Skip obvious non-creatures
                if creature_name.lower() in ['omu', 'welcome to chult', 'the expedition begins']:
                    continue

                if len(creature_name) > 2 and len(creature_name) < 50:
                    creatures.add(creature_name)

    return creatures

def extract_from_encounters(content):
    """Extract creatures from random encounter tables"""
    # Disabled for now - too much noise
    return set()

def load_ohhloz_creatures(csv_file):
    """Load creature names from OhhLoz CSV"""
    creatures = set()

    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            creature = row.get('Creature', '').strip()
            if creature:
                creatures.add(creature)

    return sorted(creatures)

def load_hamund_creatures(csv_files):
    """Load creature names from Hamund CSVs"""
    creatures = set()

    for csv_file in csv_files:
        try:
            with open(csv_file, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    creature = row.get('Creature', '').strip()
                    if creature:
                        creatures.add(creature)
        except Exception as e:
            print(f"Warning: Could not read {csv_file}: {e}")

    return sorted(creatures)

def clean_creature_list(creatures):
    """Manual cleanup of extracted creature names"""
    cleaned = set()

    # Manual exclusions - obvious non-creatures
    exclude = {
        'of the orange and gold castes.)', 'Eb Lis', 'Flving', 'RAs Nsr',
        'Kam Adan', 'Champion', 'GIANT SNAPPING TuRTLE', 'Stone J Uggernaut',
        'Volothamp "Volo" Geddarm', 'Volothamp "volo" Geddarm',
        'Liara Portyr', 'Mwaxanare', 'Artus Cimber', 'Xandala', 'Zindar',
    }

    # Manual corrections/consolidations
    corrections = {
        'Eblis': 'Eblis',
        'Eb Lis': 'Eblis',
        'Kamadan': 'Kamadan',
        'Kam Adan': 'Kamadan',
        'Ras Nsi': 'Ras Nsi',
        'RAs Nsr': 'Ras Nsi',
        'Stone Juggernaut': 'Stone Juggernaut',
        'Stone J Uggernaut': 'Stone Juggernaut',
        'GIANT SNAPPING TuRTLE': 'Giant Snapping Turtle',
        'Veloclraptor': 'Velociraptor',
        'Yuan-tibroodguard': 'Yuan-ti Broodguard',
        'Kobold S Cale Sorcerer': 'Kobold Scale Sorcerer',
        'ThORNY': 'Thorny',
        'Firenewt Warlock of !mix': 'Firenewt Warlock of Imix',
    }

    for creature in creatures:
        # Skip exclusions
        if creature in exclude:
            continue

        # Apply corrections
        if creature in corrections:
            cleaned.add(corrections[creature])
        else:
            # Skip if looks like junk
            if creature.startswith('of the ') or '."' in creature:
                continue
            if re.search(r'[^a-zA-Z\s\-]', creature) and '"' in creature:
                continue

            cleaned.add(creature)

    return sorted(cleaned)

def main():
    print("=" * 80)
    print("TOMB OF ANNIHILATION CREATURE HARVESTER TABLE ANALYSIS")
    print("=" * 80)
    print()

    # File paths
    toa_file = "R:/Foundry/Ultimate_Harvesting/reference/toa_text.txt"
    ohhloz_file = "R:/Foundry/Ultimate_Harvesting/reference/harvester_tables.csv"
    hamund_files = [
        "R:/Foundry/Ultimate_Harvesting/reference/hamund_v1_harvest.csv",
        "R:/Foundry/Ultimate_Harvesting/reference/hamund_v2_harvest.csv"
    ]

    print("Loading data...")

    # Extract creatures
    toa_creatures_raw = extract_toa_creatures(toa_file)
    toa_creatures = clean_creature_list(toa_creatures_raw)
    ohhloz_creatures = load_ohhloz_creatures(ohhloz_file)
    hamund_creatures = load_hamund_creatures(hamund_files)

    print(f"Found {len(toa_creatures)} creatures in ToA (cleaned from {len(toa_creatures_raw)} raw)")
    print(f"Found {len(ohhloz_creatures)} creatures in OhhLoz tables")
    print(f"Found {len(hamund_creatures)} creatures in Hamund tables")
    print()

    # Cross-reference
    print("=" * 80)
    print("CROSS-REFERENCE RESULTS")
    print("=" * 80)
    print()

    # Track matches
    has_ohhloz = []
    has_hamund = []
    has_both = []
    has_neither = []

    for creature in toa_creatures:
        ohhloz_match = fuzzy_match(creature, ohhloz_creatures, threshold=0.85)
        hamund_match = fuzzy_match(creature, hamund_creatures, threshold=0.85)

        if ohhloz_match and hamund_match:
            has_both.append((creature, ohhloz_match, hamund_match))
        elif ohhloz_match:
            has_ohhloz.append((creature, ohhloz_match))
        elif hamund_match:
            has_hamund.append((creature, hamund_match))
        else:
            has_neither.append(creature)

    # Print results
    print(f"CREATURES WITH ENTRIES IN BOTH TABLES ({len(has_both)}):")
    print("-" * 80)
    for creature, ohhloz, hamund in sorted(has_both):
        print(f"  • {creature}")
        print(f"      OhhLoz: {ohhloz[0][0]} ({ohhloz[0][1]:.2%} match)")
        print(f"      Hamund: {hamund[0][0]} ({hamund[0][1]:.2%} match)")
    print()

    print(f"CREATURES WITH OHHLOZ ENTRIES ONLY ({len(has_ohhloz)}):")
    print("-" * 80)
    for creature, matches in sorted(has_ohhloz):
        print(f"  • {creature}")
        print(f"      OhhLoz: {matches[0][0]} ({matches[0][1]:.2%} match)")
    print()

    print(f"CREATURES WITH HAMUND ENTRIES ONLY ({len(has_hamund)}):")
    print("-" * 80)
    for creature, matches in sorted(has_hamund):
        print(f"  • {creature}")
        print(f"      Hamund: {matches[0][0]} ({matches[0][1]:.2%} match)")
    print()

    print(f"CREATURES MISSING FROM BOTH TABLES ({len(has_neither)}):")
    print("-" * 80)
    for creature in sorted(has_neither):
        print(f"  • {creature}")
    print()

    # Summary statistics
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    total = len(toa_creatures)
    covered = len(has_both) + len(has_ohhloz) + len(has_hamund)
    print(f"Total ToA creatures:        {total}")
    print(f"Creatures with tables:      {covered} ({100*covered/total:.1f}%)")
    print(f"  - Both tables:            {len(has_both)} ({100*len(has_both)/total:.1f}%)")
    print(f"  - OhhLoz only:            {len(has_ohhloz)} ({100*len(has_ohhloz)/total:.1f}%)")
    print(f"  - Hamund only:            {len(has_hamund)} ({100*len(has_hamund)/total:.1f}%)")
    print(f"Creatures missing tables:   {len(has_neither)} ({100*len(has_neither)/total:.1f}%)")
    print()

    # Identify ToA-specific creatures that need tables
    print("=" * 80)
    print("PRIORITY: TOA-SPECIFIC CREATURES NEEDING HARVEST TABLES")
    print("=" * 80)
    print()

    # These are unique to ToA or particularly iconic to the module
    toa_specific = [
        'Almiraj', 'Aldani (Lobsterfolk)', 'Eblis', 'Flying Monkey',
        'Jaculi', 'Kamadan', 'Mantrap', 'Pterafolk', 'Su-monster',
        'Tabaxi Hunter', 'Tabaxi Minstrel', 'Zorbo',
        'Assassin Vine', 'Yellow Musk Creeper', 'Yellow Musk Zombie',
        'Triflower Frond', 'Giant Snapping Turtle',
        'Ankylosaurus Zombie', 'Girallon Zombie', 'Tyrannosaurus Zombie',
        'Atropal', 'Acererak', 'Ras Nsi',
        'Firenewt Warlock of Imix', 'Albino Dwarf Warrior',
        'Stone Juggernaut', 'Giant Four-armed Gargoyle',
    ]

    toa_missing = [c for c in has_neither if c in toa_specific]
    toa_partial = [c for c in [item[0] for item in has_ohhloz + has_hamund] if c in toa_specific]

    print("HIGH PRIORITY - ToA-unique creatures with NO tables:")
    print("-" * 80)
    for creature in sorted(toa_missing):
        print(f"  • {creature}")
    print()

    if toa_partial:
        print("MEDIUM PRIORITY - ToA creatures with partial coverage:")
        print("-" * 80)
        for creature in sorted(toa_partial):
            print(f"  • {creature}")
        print()

    print(f"Total ToA-specific creatures needing work: {len(toa_missing)}")
    print()

if __name__ == '__main__':
    main()
