# Audi folder batch analysis — 1,264 pairs processed (Apr 2026)

Total unique variants detected: 885
Variants with ≥3 pairs: 76
Variants with ≥5 pairs: 16

Variant key = ECU family | part number | software version. Where the part
number or SW version couldn't be parsed from filename it shows as "?".

Consistent offsets = addresses modified in a majority of pairs of the same
variant. These are real maps. The % change is averaged across hit pairs.

---

## unknown-256K
Variants with ≥3 pairs: 3

### 24× · pn=`?` · sw=`?`
Example: `Audi_A4_1.9_TDI_1998_Turbodiesel___66.2KWKW_Bosch_0281001658_028906021GM_357274-275_1CDC.Original`
(no offsets consistent across ≥50 % of pairs — variants differ in SW gen)

### 4× · pn=`03G906018AQ` · sw=`?`
Example: `Audi_A4_2.0_TDI_ppd_2006_Turbo-Diesel___125KWKW_Bosch_6576286546_03G906018AQ_SN100L8000000_6F98.Original`

| Offset | Shape | Hits | Avg μ (BE) | Avg Δ |
|---|---|---|---|---|
| `0x00AD3C` | loose | 4/4 | 44720 | +4.1% |
| `0x00AB90` | loose | 3/4 | 42148 | +3.1% |
| `0x00ABA6` | loose | 3/4 | 42027 | +3.1% |
| `0x00ABDE` | loose | 3/4 | 39579 | +2.9% |
| `0x021462` | 16×8 | 2/4 | 9304 | +2.8% |
| `0x01F52A` | 16×10 | 2/4 | 17233 | +2.7% |
| `0x021262` | 16×8 | 2/4 | 9732 | +2.7% |
| `0x01E96A` | 16×6 | 2/4 | 18757 | +2.5% |
| `0x01EF6A` | 16×6 | 2/4 | 18129 | +2.5% |
| `0x01EB6A` | 16×6 | 2/4 | 19343 | +2.5% |
| `0x01ED6A` | 16×6 | 2/4 | 18991 | +2.5% |
| `0x01F32A` | 16×10 | 2/4 | 18491 | +2.5% |

### 3× · pn=`03G906018DH` · sw=`?`
Example: `Audi_A3_2.0_TDI_ppd_2006_Turbodiesel___125KWKW_Bosch_6576286128_03G906018DH_SN100K5400000_C343.Original`

| Offset | Shape | Hits | Avg μ (BE) | Avg Δ |
|---|---|---|---|---|
| `0x01DFA6` | loose | 2/3 | 30150 | +4% |
| `0x00ABEA` | loose | 2/3 | 43915 | +3% |
| `0x00AA40` | loose | 2/3 | 41488 | +2.6% |
| `0x00AA90` | loose | 2/3 | 40128 | +2% |
| `0x03AC3E` | 16×13 | 2/3 | 37557 | +1.9% |


## PPD1.x
Variants with ≥3 pairs: 2

### 15× · pn=`03G906018AQ` · sw=`?`
Example: `Audi_A4_2.0_TDI_2004_Turbodiesel___125KWKW_Siemens_EDC16_03G906018AQ_SN100L6000000_9A57.Original`
(no offsets consistent across ≥50 % of pairs — variants differ in SW gen)

### 7× · pn=`?` · sw=`?`
Example: `Audi_A3_1.6_2007_Benzin___75KWKW_Siemens_5WP40344_04_06A906033GQ_0289___1021_F3D8.Original`
(no offsets consistent across ≥50 % of pairs — variants differ in SW gen)


## SIMOS_PCR21
Variants with ≥3 pairs: 1

### 13× · pn=`?` · sw=`?`
Example: `Audi_A1_1.6_TDI_CR_2004_Turbo-Diesel___77.2KWKW_Siemens__03L906023A__SM2E0DB000000_ECAC.Original`
(no offsets consistent across ≥50 % of pairs — variants differ in SW gen)


## EDC15
Variants with ≥3 pairs: 2

### 10× · pn=`?` · sw=`?`
Example: `Audi_A4_2.5_TDI_2.0_Turbodiesel___110.3KWKW_Bosch_0281010146_3B0907401G__351279-280_4D77.Original`
(no offsets consistent across ≥50 % of pairs — variants differ in SW gen)

### 3× · pn=`?` · sw=`362493`
Example: `Audi_A4_2.5_TDI_V6_2004_Turbodiesel___132.4KWKW_Bosch_0281010493_8E0907401C__362493_3426.Original`

| Offset | Shape | Hits | Avg μ (BE) | Avg Δ |
|---|---|---|---|---|
| `0x0769D8` | loose | 2/3 | 24582 | +56.6% |
| `0x076AB4` | loose | 2/3 | 40309 | -33.1% |
| `0x076A14` | loose | 2/3 | 35810 | -27.9% |
| `0x076A50` | loose | 2/3 | 26631 | +27.8% |
| `0x076A64` | loose | 2/3 | 31569 | +24.6% |
| `0x076A3C` | loose | 2/3 | 35884 | -22.3% |
| `0x076A28` | loose | 2/3 | 42174 | -21.2% |
| `0x0769EC` | loose | 2/3 | 35554 | -21% |
| `0x076A00` | loose | 2/3 | 25387 | +12.9% |
| `0x076AA0` | loose | 2/3 | 24437 | +9.9% |
| `0x076A8C` | loose | 2/3 | 31386 | +9.6% |
| `0x076A78` | loose | 2/3 | 36506 | -3.3% |


## EDC17/MED17
Variants with ≥3 pairs: 26

### 7× · pn=`?` · sw=`398757`
Example: `Audi_A3_2.0_TDI_CR_2008_Turbo-Diesel__103KWKW_Bosch__03L906022BQ_398757_6C4B.Original`

| Offset | Shape | Hits | Avg μ (BE) | Avg Δ |
|---|---|---|---|---|
| `0x1EF502` | loose | 5/7 | 14259 | +302.5% |
| `0x1EFF46` | loose | 5/7 | 14413 | +298.2% |
| `0x1FA456` | loose | 5/7 | 4135 | +200% |
| `0x1EFD24` | loose | 5/7 | 23107 | +148.4% |
| `0x1C33D0` | loose | 6/7 | 25058 | -99.9% |
| `0x1C370A` | loose | 6/7 | 29679 | -96.5% |
| `0x1C312A` | loose | 5/7 | 54278 | -92.4% |
| `0x1C3198` | loose | 5/7 | 54278 | -92.4% |
| `0x1CEBDA` | loose | 5/7 | 51886 | -88.2% |
| `0x1CEBEE` | loose | 5/7 | 51886 | -88.2% |
| `0x1CEC02` | loose | 5/7 | 51886 | -88.2% |
| `0x1CEC16` | loose | 5/7 | 51886 | -88.2% |

### 6× · pn=`?` · sw=`396484`
Example: `Audi_A4_2.0_TDI_CR_2008_Turbo-Diesel__105.2KWKW_Bosch__03L906022B__396484_B8E9.Original`

| Offset | Shape | Hits | Avg μ (BE) | Avg Δ |
|---|---|---|---|---|
| `0x06613E` | 16×10 | 3/6 | 34661 | -15.2% |
| `0x065CE6` | 16×10 | 3/6 | 32770 | -13.2% |

### 5× · pn=`03L906018JL` · sw=`522924`
Example: `Audi_A4_2.0_TDI_CR_2012_Turbo-Diesel__105.2KWKW_Bosch__03L906018JL_522924_1785.Original`

| Offset | Shape | Hits | Avg μ (BE) | Avg Δ |
|---|---|---|---|---|
| `0x07D530` | 16×7 | 2/5 | 10467 | +143.1% |
| `0x07324C` | loose | 2/5 | 20550 | +129.6% |
| `0x03D728` | loose | 5/5 | 22424 | -99.9% |
| `0x03D7B2` | loose | 5/5 | 32188 | -99.9% |
| `0x03D82E` | loose | 5/5 | 28010 | -99.9% |
| `0x03D8B2` | loose | 5/5 | 27322 | -99.9% |
| `0x03D7BE` | loose | 5/5 | 13650 | -99.8% |
| `0x032A7E` | loose | 5/5 | 55811 | -90.7% |
| `0x032BCA` | loose | 5/5 | 55811 | -90.7% |
| `0x032D16` | loose | 5/5 | 55811 | -90.7% |
| `0x032A92` | loose | 5/5 | 55811 | -88% |
| `0x032BDE` | loose | 5/5 | 55811 | -88% |

### 5× · pn=`03L906018DN` · sw=`515568`
Example: `Audi_Q5_2.0_TDI_CR_2010_Turbo-Diesel___103KWKW_Bosch__03L906018DN_515568_C454.Original`

| Offset | Shape | Hits | Avg μ (BE) | Avg Δ |
|---|---|---|---|---|
| `0x06A906` | loose | 4/5 | 26148 | +119.5% |
| `0x06C008` | loose | 4/5 | 30897 | -86.6% |
| `0x06BDFE` | loose | 4/5 | 27993 | -85.2% |
| `0x06B128` | loose | 4/5 | 32008 | +79.3% |
| `0x06B34A` | loose | 4/5 | 32976 | +74% |
| `0x06B5D2` | loose | 4/5 | 34563 | +66% |
| `0x05684E` | loose | 4/5 | 47115 | -43.5% |
| `0x056862` | loose | 4/5 | 47115 | -43.5% |
| `0x0603B6` | loose | 3/5 | 27146 | +39.1% |
| `0x0604A6` | loose | 3/5 | 35822 | -35.8% |
| `0x06042E` | loose | 3/5 | 36232 | -29.5% |
| `0x065570` | 16×6 | 4/5 | 38564 | -28.9% |

### 4× · pn=`?` · sw=`396412`
Example: `Audi_A3_2.0_TDI_CR_2007_Turbo-Diesel___103KWKW_Bosch__03L906022BQ_396412_053B.Original`

| Offset | Shape | Hits | Avg μ (BE) | Avg Δ |
|---|---|---|---|---|
| `0x1CCDCA` | loose | 2/4 | 55726 | -83.5% |
| `0x1CCDDE` | loose | 2/4 | 55726 | -83% |
| `0x07371E` | loose | 2/4 | 25180 | +40% |
| `0x073876` | loose | 2/4 | 25180 | +40% |

... and 21 more EDC17/MED17 variants (see `audi_variants.json`)

## unknown-2048K
Variants with ≥3 pairs: 33

### 7× · pn=`03L906019AL` · sw=`517566`
Example: `Audi_A4_2.0_2010_Turbo-Diesel__88.3KWKW_Bosch__03L906019AL_517566_D5BB.Original`

| Offset | Shape | Hits | Avg μ (BE) | Avg Δ |
|---|---|---|---|---|
| `0x193378` | loose | 3/7 | 51886 | -81.9% |
| `0x19338C` | loose | 3/7 | 51886 | -81.9% |
| `0x1933A0` | loose | 3/7 | 51886 | -81.9% |
| `0x1933B4` | loose | 3/7 | 51886 | -81.9% |
| `0x1933C8` | loose | 3/7 | 51886 | -81.9% |

### 7× · pn=`?` · sw=`516613`
Example: `Audi_A5_3.0_TDI_CR_2009_Turbo-Diesel__175.8KWKW_Bosch__8K1907401A__516613_0040.Original`

| Offset | Shape | Hits | Avg μ (BE) | Avg Δ |
|---|---|---|---|---|
| `0x1E424E` | 16×16 | 5/7 | 22194 | +116.2% |
| `0x191084` | loose | 5/7 | 25984 | -99.9% |
| `0x1911D2` | 8×3 | 5/7 | 23748 | -99.9% |
| `0x1912C4` | loose | 5/7 | 24138 | -99.9% |
| `0x1913CE` | loose | 5/7 | 30610 | -99.9% |
| `0x191444` | loose | 3/7 | 28695 | -99.9% |
| `0x191452` | loose | 6/7 | 35384 | -99.9% |
| `0x19151E` | loose | 6/7 | 35359 | -99.9% |
| `0x19152E` | loose | 6/7 | 36955 | -99.9% |
| `0x1B9B1E` | loose | 5/7 | 58369 | -95.3% |
| `0x1B9C6A` | loose | 5/7 | 58369 | -95.3% |
| `0x1BA974` | loose | 5/7 | 50008 | -91.3% |

### 6× · pn=`?` · sw=`516617`
Example: `Audi_A4_3.0_TDI_CR_2009_Turbo-Diesel__176.5KWKW_Bosch__8K1907401A__516617_EDE1.Original`

| Offset | Shape | Hits | Avg μ (BE) | Avg Δ |
|---|---|---|---|---|
| `0x1E3D5A` | 16×16 | 3/6 | 21945 | +117.5% |
| `0x190B9C` | loose | 3/6 | 25984 | -99.9% |
| `0x190CEA` | 8×3 | 3/6 | 23748 | -99.9% |
| `0x190DDC` | loose | 3/6 | 24138 | -99.9% |
| `0x190EE6` | loose | 3/6 | 30610 | -99.9% |
| `0x190F6A` | loose | 4/6 | 35384 | -99.9% |
| `0x191036` | loose | 4/6 | 35359 | -99.9% |
| `0x191046` | loose | 4/6 | 36955 | -99.9% |
| `0x1B8F04` | loose | 3/6 | 49410 | -96% |
| `0x1B8DB8` | loose | 3/6 | 49837 | -95.1% |
| `0x1B92EA` | loose | 3/6 | 58369 | -92.7% |
| `0x1B9436` | loose | 4/6 | 58369 | -92.3% |

### 6× · pn=`?` · sw=`518178`
Example: `Audi_A5_3.0_TDI_CR_2010_Turbo-Diesel__175.8KWKW_Bosch__4L0907401A__518178_3EF4.Original`

| Offset | Shape | Hits | Avg μ (BE) | Avg Δ |
|---|---|---|---|---|
| `0x1FAAF6` | 16×16 | 3/6 | 22186 | +115.5% |
| `0x1C7028` | loose | 3/6 | 29341 | -99.9% |
| `0x1C703C` | loose | 3/6 | 30194 | -99.9% |
| `0x1C7050` | loose | 3/6 | 32753 | -99.9% |
| `0x1C7064` | loose | 3/6 | 37274 | -99.9% |
| `0x1C71C2` | loose | 3/6 | 29211 | -99.9% |
| `0x1C71EA` | loose | 3/6 | 29616 | -99.9% |
| `0x1C732C` | loose | 3/6 | 35013 | -99.9% |
| `0x1C733E` | loose | 3/6 | 21382 | -99.9% |
| `0x1C752C` | loose | 3/6 | 31387 | -99.9% |
| `0x1C75A4` | loose | 3/6 | 34940 | -99.9% |
| `0x1C7668` | loose | 3/6 | 35359 | -99.9% |

### 6× · pn=`?` · sw=`516623`
Example: `Audi_A6_3.0_TDI_CR_2008_Turbo-Diesel__175.8KWKW_Bosch__4F0907401E__516623_BAB5.Original`

| Offset | Shape | Hits | Avg μ (BE) | Avg Δ |
|---|---|---|---|---|
| `0x19175C` | loose | 4/6 | 18112 | +18757.9% |
| `0x19166A` | 8×3 | 4/6 | 17819 | +18453.4% |
| `0x191866` | loose | 4/6 | 25055 | +65.1% |
| `0x1E0D36` | loose | 4/6 | 26799 | +22% |
| `0x1E1A86` | loose | 4/6 | 30783 | -10.4% |
| `0x1E13CC` | loose | 4/6 | 34077 | +9.5% |
| `0x1E01FC` | loose | 4/6 | 31602 | -9.3% |
| `0x1E021A` | loose | 4/6 | 31660 | -9% |
| `0x1D7D7A` | loose | 4/6 | 33738 | -6.6% |
| `0x1D7456` | loose | 4/6 | 33285 | -6.4% |
| `0x1E0A4A` | loose | 4/6 | 21822 | -6.4% |
| `0x1D72DE` | loose | 4/6 | 33719 | -6% |

... and 28 more unknown-2048K variants (see `audi_variants.json`)

## ME7.x
Variants with ≥3 pairs: 3

### 5× · pn=`?` · sw=`?`
Example: `Audi_A6_1.8T_20V__Turbo-Benzin___110.3KWKW_Bosch_0261206917_4B0906018CA__6509.Original`

| Offset | Shape | Hits | Avg μ (BE) | Avg Δ |
|---|---|---|---|---|
| `0x018AB6` | 8×6 | 2/5 | 28119 | -0.8% |
| `0x0FFFE0` | loose | 3/5 | 37840 | +0.2% |
| `0x01FC96` | loose | 2/5 | 35631 | -0.1% |
| `0x01FC68` | 8×3 | 2/5 | 31218 | 0% |
| `0x01FC46` | 8×4 | 2/5 | 32592 | 0% |

### 3× · pn=`?` · sw=`350722`
Example: `Audi_A4_1.8i_1999_Benzin___91.9KWKW_Bosch_0261204873_8D0906018D__350722_6A8D.Original`

| Offset | Shape | Hits | Avg μ (BE) | Avg Δ |
|---|---|---|---|---|
| `0x01BFB6` | loose | 2/3 | 8295 | +197.6% |
| `0x01DF2E` | loose | 2/3 | 65535 | -81.7% |
| `0x07FE66` | loose | 2/3 | 65535 | -67.3% |
| `0x066CB0` | loose | 3/3 | 34841 | +15.1% |
| `0x015DD6` | loose | 2/3 | 9732 | +12.4% |
| `0x015E86` | loose | 2/3 | 11627 | +12% |
| `0x012F7E` | 32×4 | 2/3 | 31075 | -8.6% |
| `0x012F92` | 32×4 | 2/3 | 30033 | -8.5% |
| `0x012FA8` | 32×3 | 2/3 | 33135 | -8% |
| `0x011AC8` | 12×13 | 2/3 | 30775 | -5.8% |
| `0x0166E8` | loose | 2/3 | 11340 | +5.6% |
| `0x07FFE0` | loose | 3/3 | 26966 | -2% |

### 3× · pn=`?` · sw=`360287`
Example: `Audi_A4_1.8_T__Turbo-Benzin___132.4KWKW_Bosch_0261206790_8L0906018Q__360287_97D9.Original`

| Offset | Shape | Hits | Avg μ (BE) | Avg Δ |
|---|---|---|---|---|
| `0x01EB92` | loose | 2/3 | 28693 | +106.6% |
| `0x01679A` | loose | 2/3 | 23046 | +28.4% |
| `0x01EAD8` | loose | 2/3 | 24670 | +18.4% |
| `0x01E8FA` | loose | 2/3 | 31961 | +6.4% |
| `0x08D940` | loose | 2/3 | 30980 | +4.5% |
| `0x01934A` | loose | 2/3 | 29216 | -3% |
| `0x0192FE` | 8×5 | 2/3 | 33730 | -1.1% |
| `0x01EB1A` | loose | 2/3 | 28967 | -0.8% |
| `0x01FE36` | loose | 2/3 | 25008 | +0.3% |
| `0x01FC56` | 8×3 | 2/3 | 34392 | 0% |


## MED17
Variants with ≥3 pairs: 3

### 5× · pn=`?` · sw=`387549`
Example: `Audi_TT2_2.0_TFSI_2006_Turbo-Benzin___147.1KWKW_Bosch_0261S02519_8J0907115N__387549_8638.Original`

| Offset | Shape | Hits | Avg μ (BE) | Avg Δ |
|---|---|---|---|---|
| `0x0A0388` | loose | 2/5 | 3724 | +780% |
| `0x0A0378` | loose | 2/5 | 5115 | +540.6% |
| `0x1CE838` | loose | 5/5 | 10604 | +518% |
| `0x1CF454` | loose | 5/5 | 32613 | +100.9% |
| `0x1C4CFA` | loose | 5/5 | 4247 | +70% |
| `0x1CF604` | loose | 3/5 | 5864 | +22.4% |
| `0x1CE798` | loose | 5/5 | 30712 | +16.3% |
| `0x1C33E8` | loose | 2/5 | 33103 | +10.3% |
| `0x1CE9E0` | loose | 2/5 | 29411 | +10.1% |
| `0x1CF436` | loose | 3/5 | 30238 | +8.8% |
| `0x1C3322` | loose | 5/5 | 58535 | +8.5% |
| `0x1CF758` | 8×8 | 5/5 | 7016 | +8.4% |

### 3× · pn=`?` · sw=`396770`
Example: `Audi_A3_2.0_TFSI_2008_Turbo-Diesel___147.1KWKW_Bosch_0261S04240_8P0907115Q__396770_834A.Original`

| Offset | Shape | Hits | Avg μ (BE) | Avg Δ |
|---|---|---|---|---|
| `0x059BE6` | loose | 2/3 | 31503 | +39.7% |

### 3× · pn=`?` · sw=`387944`
Example: `Audi_RS4_4.2_V8_2006_Benzin___308.9KWKW_Bosch_0261S02165_8E1907560___387944_8C75.Original`

| Offset | Shape | Hits | Avg μ (BE) | Avg Δ |
|---|---|---|---|---|
| `0x1DCCA2` | loose | 2/3 | 33408 | +15.9% |
| `0x1DCCB2` | loose | 2/3 | 22012 | +15.8% |
| `0x1DCF8C` | loose | 2/3 | 31270 | +5.9% |


## SIMOS_PCR
Variants with ≥3 pairs: 1

### 4× · pn=`?` · sw=`?`
Example: `Audi_A1_1.2TSI_12-01-2012___63.3KWKW_Siemens__03F906070GN_SA300O1000000_6688.Original`

| Offset | Shape | Hits | Avg μ (BE) | Avg Δ |
|---|---|---|---|---|
| `0x1E0568` | loose | 2/4 | 4 | +454375% |
| `0x1E0070` | loose | 2/4 | 5888 | +171.7% |
| `0x1E00CC` | loose | 2/4 | 16408 | +99.9% |
| `0x1E00EC` | loose | 2/4 | 18457 | +77.7% |
| `0x1CCF60` | loose | 2/4 | 34443 | -61.5% |
| `0x1CEDF0` | loose | 2/4 | 50373 | -60.8% |
| `0x1CCEC2` | loose | 2/4 | 41674 | -49.6% |
| `0x1CCED6` | loose | 2/4 | 41674 | -49.6% |
| `0x1CCEEA` | loose | 2/4 | 41674 | -49.6% |
| `0x1E00FC` | loose | 2/4 | 22552 | +45.5% |
| `0x1CEB30` | loose | 2/4 | 34964 | -43.5% |
| `0x1DFF44` | 8×6 | 2/4 | 19142 | +36.1% |


## EDC16 PD
Variants with ≥3 pairs: 1

### 3× · pn=`?` · sw=`382716`
Example: `Audi_A6_2.0_TDI_2007_Turbodiesel___103KWKW_Bosch__03G906016BF_382716_533D.Original`
(no offsets consistent across ≥50 % of pairs — variants differ in SW gen)


## EDC16
Variants with ≥3 pairs: 1

### 3× · pn=`?` · sw=`518178`
Example: `Audi_Q7_3.0_TDI_CR_2008_Turbo-Diesel___176.5KWKW_Bosch_0281014174_4L0907401A__518178_52F6.Original`

| Offset | Shape | Hits | Avg μ (BE) | Avg Δ |
|---|---|---|---|---|
| `0x1C732C` | loose | 2/3 | 35013 | -99.9% |
| `0x1C733E` | loose | 2/3 | 21382 | -99.9% |

