# Indonesia Kabupaten/Kota GeoJSON Attribution

- Source URL: https://github.com/ardian28/GeoJson-Indonesia-38-Provinsi/blob/main/Kabupaten/38%20Provinsi%20Indonesia%20-%20Kabupaten.json
- Raw source URL: https://raw.githubusercontent.com/ardian28/GeoJson-Indonesia-38-Provinsi/main/Kabupaten/38%20Provinsi%20Indonesia%20-%20Kabupaten.json
- Source repository commit/version: `486e89ca57c9f9910991dbf00afca26297b3baa3` (committed 2024-10-30T09:01:39Z)
- License: MIT License, copyright 2024 Ardian Saputra Hasibuan.
- Local transformation: normalized into a full 518-feature offline kabupaten/kota asset and stripped to required properties only: `name`, `province`, `region_type`, and `map_key`, preserving source geometries for local SVG rendering. `map_key` values use the same `normalize_region_key(region_type, name)` contract as the local API `region_key` filter (for example `kota-bandung`).

This full 518-feature asset is offline-only and used for visual distribution triage. Buyer region matching is derived from buyer-name text and is not official coordinate or legal proof.
