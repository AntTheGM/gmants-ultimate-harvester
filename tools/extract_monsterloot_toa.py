"""Extract text from Monster Loot - Tomb of Annihilation PDF."""
import fitz

pdf_path = "R:/SPG/Modules/ToA/Reference/Monster Loot - Tomb of Annihilation.pdf"
doc = fitz.open(pdf_path)
print(f"Pages: {len(doc)}")

out_path = "R:/Foundry/Ultimate_Harvesting/reference/monsterloot_toa_text.txt"
with open(out_path, "w", encoding="utf-8") as f:
    for i in range(len(doc)):
        page = doc[i]
        text = page.get_text()
        f.write(f"\n=== PAGE {i+1} ===\n")
        f.write(text)

print(f"Saved to {out_path}")
doc.close()
