-- ============================================================
-- DCTuning Ireland — Vehicle Database Seed  (Phase 2)
-- Run in Supabase Dashboard → SQL Editor
-- Continues from Audi A4 B7 / Phase 1 endpoint
-- ============================================================

-- Prevent duplicates on re-run
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vehicle_database') THEN
    RAISE EXCEPTION 'vehicle_database table does not exist — run Phase 1 migration first';
  END IF;
END $$;

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  AUDI  (continuing from A4 B8)                              ║
-- ╚══════════════════════════════════════════════════════════════╝

INSERT INTO vehicle_database (make, model, variant, engine_code, kw, ps, hp, fuel_type, year_from, year_to, ecu, ecu_family) VALUES

-- ── Audi A4 B8 (2007–2015) ──────────────────────────────────
('Audi','A4 B8','2.0 TFSI 180','CDNB',132,180,178,'Petrol',2007,2012,'Bosch MED17.1','Bosch MED17'),
('Audi','A4 B8','2.0 TFSI 211','CDNC',155,211,208,'Petrol',2008,2012,'Bosch MED17.1','Bosch MED17'),
('Audi','A4 B8','2.0 TFSI 225','CNCD',165,225,222,'Petrol',2012,2015,'Bosch MED17.1.1','Bosch MED17'),
('Audi','A4 B8','1.8 TFSI 160','CDHA',118,160,158,'Petrol',2008,2011,'Bosch MED17.1','Bosch MED17'),
('Audi','A4 B8','2.0 TDI 136','CAGA',100,136,134,'Diesel',2007,2012,'Bosch EDC17C46','Bosch EDC17'),
('Audi','A4 B8','2.0 TDI 143','CJCA',105,143,141,'Diesel',2008,2012,'Bosch EDC17C46','Bosch EDC17'),
('Audi','A4 B8','2.0 TDI 163','CAHA',120,163,161,'Diesel',2007,2012,'Bosch EDC17C46','Bosch EDC17'),
('Audi','A4 B8','2.0 TDI 177','CGLC',130,177,175,'Diesel',2011,2015,'Bosch EDC17C46','Bosch EDC17'),
('Audi','A4 B8','3.0 TDI 240','CCWA',176,240,237,'Diesel',2007,2012,'Bosch EDC17CP14','Bosch EDC17'),
('Audi','A4 B8','3.0 TDI 245','CDYA',180,245,242,'Diesel',2012,2015,'Bosch EDC17CP54','Bosch EDC17'),
('Audi','A4 B8','3.0 TFSI S4 333','CAKA',245,333,328,'Petrol',2009,2015,'Bosch MED17.1','Bosch MED17'),

-- ── Audi A4 B9 (2015–present) ───────────────────────────────
('Audi','A4 B9','2.0 TFSI 190','CYRL',140,190,188,'Petrol',2015,2019,'Bosch MG1CS001','Bosch MG1'),
('Audi','A4 B9','2.0 TFSI 252','CYPA',185,252,249,'Petrol',2016,2019,'Bosch MG1CS001','Bosch MG1'),
('Audi','A4 B9','45 TFSI 265','DKZA',195,265,261,'Petrol',2019,2024,'Bosch MG1CS011','Bosch MG1'),
('Audi','A4 B9','2.0 TDI 122','DETA',90,122,120,'Diesel',2015,2019,'Bosch EDC17C64','Bosch EDC17'),
('Audi','A4 B9','2.0 TDI 150','DEUA',110,150,148,'Diesel',2015,2019,'Bosch EDC17C64','Bosch EDC17'),
('Audi','A4 B9','2.0 TDI 190','DETA',140,190,188,'Diesel',2016,2019,'Bosch EDC17C74','Bosch EDC17'),
('Audi','A4 B9','35 TDI 163','DESA',120,163,161,'Diesel',2019,2024,'Bosch MD1CS004','Bosch MD1'),
('Audi','A4 B9','40 TDI 204','DFGA',150,204,201,'Diesel',2019,2024,'Bosch MD1CS004','Bosch MD1'),
('Audi','A4 B9','3.0 TDI S4 347','DETA',255,347,342,'Diesel',2019,2024,'Bosch MD1CS004','Bosch MD1'),

-- ── Audi A5 8T (2007–2016) ──────────────────────────────────
('Audi','A5 8T','2.0 TFSI 180','CDNB',132,180,178,'Petrol',2007,2012,'Bosch MED17.1','Bosch MED17'),
('Audi','A5 8T','2.0 TFSI 211','CDNC',155,211,208,'Petrol',2008,2012,'Bosch MED17.1','Bosch MED17'),
('Audi','A5 8T','2.0 TFSI 225','CNCD',165,225,222,'Petrol',2012,2016,'Bosch MED17.1.1','Bosch MED17'),
('Audi','A5 8T','3.0 TFSI S5 333','CAKA',245,333,328,'Petrol',2007,2012,'Bosch MED17.1','Bosch MED17'),
('Audi','A5 8T','3.0 TFSI S5 354','CTUA',260,354,349,'Petrol',2012,2016,'Bosch MED17.1','Bosch MED17'),
('Audi','A5 8T','2.0 TDI 143','CJCA',105,143,141,'Diesel',2007,2012,'Bosch EDC17C46','Bosch EDC17'),
('Audi','A5 8T','2.0 TDI 177','CAHA',130,177,175,'Diesel',2010,2016,'Bosch EDC17C46','Bosch EDC17'),
('Audi','A5 8T','3.0 TDI 245','CCWA',176,240,237,'Diesel',2007,2016,'Bosch EDC17CP14','Bosch EDC17'),

-- ── Audi A5 F5 (2016–present) ───────────────────────────────
('Audi','A5 F5','2.0 TFSI 190','CYRL',140,190,188,'Petrol',2016,2020,'Bosch MG1CS001','Bosch MG1'),
('Audi','A5 F5','2.0 TFSI 252','CYPA',185,252,249,'Petrol',2016,2020,'Bosch MG1CS001','Bosch MG1'),
('Audi','A5 F5','45 TFSI 265','DKZA',195,265,261,'Petrol',2020,2024,'Bosch MG1CS011','Bosch MG1'),
('Audi','A5 F5','2.0 TDI 150','DEUA',110,150,148,'Diesel',2016,2020,'Bosch EDC17C64','Bosch EDC17'),
('Audi','A5 F5','2.0 TDI 190','DETA',140,190,188,'Diesel',2016,2020,'Bosch EDC17C74','Bosch EDC17'),
('Audi','A5 F5','3.0 TDI 218','CREC',160,218,215,'Diesel',2016,2020,'Bosch EDC17CP54','Bosch EDC17'),
('Audi','A5 F5','3.0 TDI S5 347','DETA',255,347,342,'Diesel',2020,2024,'Bosch MD1CS004','Bosch MD1'),

-- ── Audi A6 C6 (2004–2011) ──────────────────────────────────
('Audi','A6 C6','2.0 TDI 140','BRE',103,140,138,'Diesel',2004,2008,'Bosch EDC16U1','Bosch EDC16'),
('Audi','A6 C6','2.7 TDI 163','BPP',120,163,161,'Diesel',2004,2008,'Bosch EDC16CP34','Bosch EDC16'),
('Audi','A6 C6','2.7 TDI 190','CANA',140,190,188,'Diesel',2008,2011,'Bosch EDC17CP14','Bosch EDC17'),
('Audi','A6 C6','3.0 TDI 204','BMK',150,204,201,'Diesel',2004,2008,'Bosch EDC16CP34','Bosch EDC16'),
('Audi','A6 C6','3.0 TDI 240','CANA',176,240,237,'Diesel',2008,2011,'Bosch EDC17CP14','Bosch EDC17'),
('Audi','A6 C6','2.4 V6 177','BDW',130,177,175,'Petrol',2004,2009,'Bosch ME7.1.1','Bosch ME7'),
('Audi','A6 C6','3.0 TFSI S6 435','CEUC',320,435,429,'Petrol',2006,2011,'Bosch MED17.1','Bosch MED17'),

-- ── Audi A6 C7 (2011–2018) ──────────────────────────────────
('Audi','A6 C7','2.0 TDI 177','CGQB',130,177,175,'Diesel',2011,2014,'Bosch EDC17C46','Bosch EDC17'),
('Audi','A6 C7','2.0 TDI 190','CNHA',140,190,188,'Diesel',2014,2018,'Bosch EDC17C74','Bosch EDC17'),
('Audi','A6 C7','3.0 TDI 204','CZVA',150,204,201,'Diesel',2011,2014,'Bosch EDC17CP44','Bosch EDC17'),
('Audi','A6 C7','3.0 TDI 218','CDUC',160,218,215,'Diesel',2011,2014,'Bosch EDC17CP54','Bosch EDC17'),
('Audi','A6 C7','3.0 TDI 245','CDUD',180,245,242,'Diesel',2014,2018,'Bosch EDC17CP54','Bosch EDC17'),
('Audi','A6 C7','3.0 TDI 272','CRTD',200,272,268,'Diesel',2014,2018,'Bosch EDC17CP54','Bosch EDC17'),
('Audi','A6 C7','3.0 TFSI S6 420','CTUA',309,420,414,'Petrol',2012,2018,'Bosch MED17.1','Bosch MED17'),
('Audi','A6 C7','4.0 TFSI RS6 560','CWUB',412,560,552,'Petrol',2013,2018,'Bosch MED17.1.6','Bosch MED17'),

-- ── Audi A7 4G (2010–2018) ──────────────────────────────────
('Audi','A7 4G','3.0 TDI 204','CDUC',150,204,201,'Diesel',2010,2014,'Bosch EDC17CP44','Bosch EDC17'),
('Audi','A7 4G','3.0 TDI 218','CDUC',160,218,215,'Diesel',2010,2014,'Bosch EDC17CP54','Bosch EDC17'),
('Audi','A7 4G','3.0 TDI 245','CDUD',180,245,242,'Diesel',2014,2018,'Bosch EDC17CP54','Bosch EDC17'),
('Audi','A7 4G','3.0 TDI 272','CRTD',200,272,268,'Diesel',2014,2018,'Bosch EDC17CP54','Bosch EDC17'),
('Audi','A7 4G','3.0 TFSI S7 420','CTUA',309,420,414,'Petrol',2012,2018,'Bosch MED17.1','Bosch MED17'),
('Audi','A7 4G','4.0 TFSI RS7 560','CWUB',412,560,552,'Petrol',2013,2018,'Bosch MED17.1.6','Bosch MED17'),

-- ── Audi Q3 8U (2011–2018) ──────────────────────────────────
('Audi','Q3 8U','2.0 TFSI 170','CCZC',125,170,168,'Petrol',2011,2015,'Bosch MED17.1','Bosch MED17'),
('Audi','Q3 8U','2.0 TFSI 211','CCZB',155,211,208,'Petrol',2012,2018,'Bosch MED17.1','Bosch MED17'),
('Audi','Q3 8U','2.0 TDI 140','CFGB',103,140,138,'Diesel',2011,2015,'Bosch EDC17C46','Bosch EDC17'),
('Audi','Q3 8U','2.0 TDI 177','CFGC',130,177,175,'Diesel',2012,2018,'Bosch EDC17C46','Bosch EDC17'),
('Audi','Q3 8U','2.5 TFSI RS Q3 310','CZGB',228,310,306,'Petrol',2014,2018,'Bosch MED17.1.1','Bosch MED17'),

-- ── Audi Q5 8R (2008–2017) ──────────────────────────────────
('Audi','Q5 8R','2.0 TFSI 180','CDNB',132,180,178,'Petrol',2008,2012,'Bosch MED17.1','Bosch MED17'),
('Audi','Q5 8R','2.0 TFSI 211','CDNC',155,211,208,'Petrol',2010,2012,'Bosch MED17.1','Bosch MED17'),
('Audi','Q5 8R','2.0 TFSI 225','CNCD',165,225,222,'Petrol',2012,2017,'Bosch MED17.1.1','Bosch MED17'),
('Audi','Q5 8R','2.0 TDI 136','CAHA',100,136,134,'Diesel',2008,2012,'Bosch EDC17C46','Bosch EDC17'),
('Audi','Q5 8R','2.0 TDI 163','CAHA',120,163,161,'Diesel',2008,2012,'Bosch EDC17C46','Bosch EDC17'),
('Audi','Q5 8R','2.0 TDI 190','CGLC',140,190,188,'Diesel',2012,2017,'Bosch EDC17C46','Bosch EDC17'),
('Audi','Q5 8R','3.0 TDI 240','CCWA',176,240,237,'Diesel',2008,2012,'Bosch EDC17CP14','Bosch EDC17'),
('Audi','Q5 8R','3.0 TDI 245','CDYA',180,245,242,'Diesel',2012,2017,'Bosch EDC17CP54','Bosch EDC17'),
('Audi','Q5 8R','3.0 TFSI SQ5 313','CTUD',230,313,309,'Petrol',2013,2017,'Bosch MED17.1','Bosch MED17'),

-- ── Audi Q7 4L (2005–2015) ──────────────────────────────────
('Audi','Q7 4L','3.0 TDI 240','BTNG',176,240,237,'Diesel',2006,2009,'Bosch EDC16CP34','Bosch EDC16'),
('Audi','Q7 4L','3.0 TDI 245','CRCA',180,245,242,'Diesel',2009,2015,'Bosch EDC17CP44','Bosch EDC17'),
('Audi','Q7 4L','4.2 TDI 340','CDSB',250,340,335,'Diesel',2006,2015,'Bosch EDC17CP44','Bosch EDC17'),
('Audi','Q7 4L','3.0 TFSI 272','CREC',200,272,268,'Petrol',2010,2015,'Bosch MED17.1','Bosch MED17'),

-- ── Audi TT 8J (2006–2014) ──────────────────────────────────
('Audi','TT 8J','2.0 TFSI 200','BWA',147,200,197,'Petrol',2006,2010,'Bosch MED9.1','Bosch MED9'),
('Audi','TT 8J','2.0 TFSI 211','CDLF',155,211,208,'Petrol',2010,2014,'Bosch MED17.1','Bosch MED17'),
('Audi','TT 8J','2.0 TDI 170','CEGA',125,170,168,'Diesel',2008,2014,'Bosch EDC17C46','Bosch EDC17'),
('Audi','TT 8J','2.5 TFSI RS 340','CEPA',250,340,335,'Petrol',2009,2014,'Bosch MED17.1.1','Bosch MED17'),

-- ── Audi TT 8S (2014–present) ───────────────────────────────
('Audi','TT 8S','2.0 TFSI 230','CHHB',169,230,227,'Petrol',2014,2023,'Bosch MG1CS001','Bosch MG1'),
('Audi','TT 8S','2.0 TDI 184','DKRB',135,184,181,'Diesel',2016,2023,'Bosch MD1CS004','Bosch MD1'),
('Audi','TT 8S','2.5 TFSI RS TT 400','DNUE',294,400,394,'Petrol',2016,2023,'Bosch MG1CS011','Bosch MG1'),

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  BMW                                                        ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── BMW 1 Series E87 (2004–2011) ────────────────────────────
('BMW','1 Series E87','116i 1.6','N45B16',85,116,114,'Petrol',2004,2007,'Bosch ME9.2','Bosch ME9'),
('BMW','1 Series E87','118i 2.0','N43B20',103,140,138,'Petrol',2007,2011,'Bosch MED17.2','Bosch MED17'),
('BMW','1 Series E87','120i 2.0','N43B20',115,156,154,'Petrol',2007,2011,'Bosch MED17.2','Bosch MED17'),
('BMW','1 Series E87','118d 2.0','N47D20',105,143,141,'Diesel',2007,2011,'Bosch EDC17C06','Bosch EDC17'),
('BMW','1 Series E87','120d 2.0','N47D20',130,177,175,'Diesel',2007,2011,'Bosch EDC17C06','Bosch EDC17'),
('BMW','1 Series E87','123d 2.0','N47D20OL',150,204,201,'Diesel',2007,2011,'Bosch EDC17C06','Bosch EDC17'),
('BMW','1 Series E87','130i 3.0','N52B30',195,265,261,'Petrol',2005,2011,'Bosch MSV70','Bosch MSV70'),
('BMW','1 Series E82','135i 3.0 N54','N54B30',225,306,302,'Petrol',2007,2013,'Bosch MSD81','Bosch MSD80'),
('BMW','1 Series E82','135i 3.0 N55','N55B30',225,306,302,'Petrol',2010,2013,'Bosch MEVD17.2','Bosch MEVD17'),

-- ── BMW 1 Series F20 (2011–2019) ────────────────────────────
('BMW','1 Series F20','116i 1.5','B38A15M0',80,109,107,'Petrol',2015,2019,'Bosch MG1CS003','Bosch MG1'),
('BMW','1 Series F20','118i 1.5','B38A15M0',100,136,134,'Petrol',2015,2019,'Bosch MG1CS003','Bosch MG1'),
('BMW','1 Series F20','120i 2.0','N20B20',135,184,181,'Petrol',2011,2015,'Bosch MEVD17.2','Bosch MEVD17'),
('BMW','1 Series F20','125i 2.0','N20B20',160,218,215,'Petrol',2012,2015,'Bosch MEVD17.2','Bosch MEVD17'),
('BMW','1 Series F20','118d 2.0','B47D20',110,150,148,'Diesel',2015,2019,'Bosch EDC17C41','Bosch EDC17'),
('BMW','1 Series F20','120d 2.0','B47D20',140,190,188,'Diesel',2015,2019,'Bosch EDC17C41','Bosch EDC17'),
('BMW','1 Series F20','M135i 3.0','N55B30',235,320,316,'Petrol',2012,2016,'Bosch MEVD17.2.G','Bosch MEVD17'),
('BMW','1 Series F20','M140i 3.0','B58B30M0',250,340,335,'Petrol',2016,2019,'Bosch MG1CS003','Bosch MG1'),

-- ── BMW 3 Series E90/E92 (2005–2012) ────────────────────────
('BMW','3 Series E90','316i 1.6','N43B16',90,122,120,'Petrol',2005,2012,'Bosch MED17.2','Bosch MED17'),
('BMW','3 Series E90','318i 2.0','N43B20',105,143,141,'Petrol',2007,2012,'Bosch MED17.2','Bosch MED17'),
('BMW','3 Series E90','320i 2.0','N43B20',110,150,148,'Petrol',2007,2012,'Bosch MED17.2','Bosch MED17'),
('BMW','3 Series E90','325i 3.0','N52B25',160,218,215,'Petrol',2005,2012,'Bosch MSV70','Bosch MSV70'),
('BMW','3 Series E90','330i 3.0','N53B30',200,272,268,'Petrol',2005,2012,'Bosch MSD80','Bosch MSD80'),
('BMW','3 Series E90','335i 3.0 N54','N54B30',225,306,302,'Petrol',2006,2010,'Bosch MSD81','Bosch MSD80'),
('BMW','3 Series E90','335i 3.0 N55','N55B30',225,306,302,'Petrol',2010,2012,'Bosch MEVD17.2','Bosch MEVD17'),
('BMW','3 Series E90','318d 2.0','N47D20',90,122,120,'Diesel',2005,2012,'Bosch EDC17C06','Bosch EDC17'),
('BMW','3 Series E90','320d 2.0','N47D20',130,177,175,'Diesel',2007,2012,'Bosch EDC17C06','Bosch EDC17'),
('BMW','3 Series E90','325d 3.0','M57D30OL',145,197,194,'Diesel',2005,2012,'Bosch EDC16CP35','Bosch EDC16'),
('BMW','3 Series E90','330d 3.0','M57D30',155,211,208,'Diesel',2005,2009,'Bosch EDC16CP35','Bosch EDC16'),
('BMW','3 Series E90','335d 3.0','M57D30OL',210,286,282,'Diesel',2006,2012,'Bosch EDC16CP35','Bosch EDC16'),
('BMW','3 Series E92','M3 4.0 V8','S65B40',309,420,414,'Petrol',2007,2013,'Siemens MSS60','Siemens MSS60'),

-- ── BMW 3 Series F30 (2012–2019) ────────────────────────────
('BMW','3 Series F30','316i 1.6','N13B16',85,116,114,'Petrol',2012,2015,'Bosch MEVD17.2','Bosch MEVD17'),
('BMW','3 Series F30','318i 1.5','B38A15M0',100,136,134,'Petrol',2015,2019,'Bosch MG1CS003','Bosch MG1'),
('BMW','3 Series F30','320i 2.0','B48B20M0',135,184,181,'Petrol',2015,2019,'Bosch MG1CS003','Bosch MG1'),
('BMW','3 Series F30','328i 2.0','N20B20',180,245,242,'Petrol',2012,2016,'Bosch MEVD17.2','Bosch MEVD17'),
('BMW','3 Series F30','330i 2.0','B48B20M0',185,252,249,'Petrol',2016,2019,'Bosch MG1CS003','Bosch MG1'),
('BMW','3 Series F30','335i 3.0','N55B30',225,306,302,'Petrol',2012,2015,'Bosch MEVD17.2.G','Bosch MEVD17'),
('BMW','3 Series F30','340i 3.0','B58B30M0',240,326,321,'Petrol',2015,2019,'Bosch MG1CS003','Bosch MG1'),
('BMW','3 Series F30','316d 2.0','B47D20',85,116,114,'Diesel',2014,2019,'Bosch EDC17C41','Bosch EDC17'),
('BMW','3 Series F30','318d 2.0','B47D20',110,150,148,'Diesel',2015,2019,'Bosch EDC17C41','Bosch EDC17'),
('BMW','3 Series F30','320d 2.0','N47D20',120,163,161,'Diesel',2012,2014,'Bosch EDC17C06','Bosch EDC17'),
('BMW','3 Series F30','320d 2.0','B47D20',140,190,188,'Diesel',2014,2019,'Bosch EDC17C41','Bosch EDC17'),
('BMW','3 Series F30','325d 2.0','B47D20',160,218,215,'Diesel',2015,2019,'Bosch EDC17C41','Bosch EDC17'),
('BMW','3 Series F30','330d 3.0','N57D30',190,258,255,'Diesel',2012,2019,'Bosch EDC17CP02','Bosch EDC17'),
('BMW','3 Series F30','335d 3.0','N57D30S1',230,313,309,'Diesel',2013,2019,'Bosch EDC17CP02','Bosch EDC17'),
('BMW','3 Series F30','M3 3.0','S55B30A',317,431,425,'Petrol',2014,2019,'Bosch MG1CS002','Bosch MG1'),

-- ── BMW 5 Series E60 (2003–2010) ────────────────────────────
('BMW','5 Series E60','520i 2.2','M54B22',125,170,168,'Petrol',2003,2005,'Bosch MS43','Bosch MS43'),
('BMW','5 Series E60','523i 2.5','N52B25',130,177,175,'Petrol',2005,2010,'Bosch MSV70','Bosch MSV70'),
('BMW','5 Series E60','525i 2.5','N52B25',160,218,215,'Petrol',2005,2010,'Bosch MSV70','Bosch MSV70'),
('BMW','5 Series E60','530i 3.0','N52B30',200,272,268,'Petrol',2005,2010,'Bosch MSV70','Bosch MSV70'),
('BMW','5 Series E60','535i 3.0','N54B30',225,306,302,'Petrol',2007,2010,'Bosch MSD81','Bosch MSD80'),
('BMW','5 Series E60','520d 2.0','M47D20',120,163,161,'Diesel',2005,2010,'Bosch EDC16C35','Bosch EDC16'),
('BMW','5 Series E60','525d 2.5','M57D25',130,177,175,'Diesel',2003,2010,'Bosch EDC16CP35','Bosch EDC16'),
('BMW','5 Series E60','530d 3.0','M57D30',170,231,228,'Diesel',2005,2010,'Bosch EDC16CP35','Bosch EDC16'),
('BMW','5 Series E60','535d 3.0','M57D30OL',200,272,268,'Diesel',2004,2010,'Bosch EDC16CP35','Bosch EDC16'),
('BMW','5 Series E60','M5 5.0 V10','S85B50',373,507,500,'Petrol',2005,2010,'Siemens MSS65','Siemens MSS65'),

-- ── BMW 5 Series F10 (2010–2017) ────────────────────────────
('BMW','5 Series F10','520i 2.0','N20B20',135,184,181,'Petrol',2011,2013,'Bosch MEVD17.2','Bosch MEVD17'),
('BMW','5 Series F10','528i 2.0','N20B20',180,245,242,'Petrol',2010,2016,'Bosch MEVD17.2','Bosch MEVD17'),
('BMW','5 Series F10','535i 3.0','N55B30',225,306,302,'Petrol',2010,2013,'Bosch MEVD17.2.G','Bosch MEVD17'),
('BMW','5 Series F10','550i 4.4','N63B44',300,408,402,'Petrol',2010,2017,'Bosch MEVD17.2.8','Bosch MEVD17'),
('BMW','5 Series F10','518d 2.0','N47D20',105,143,141,'Diesel',2011,2013,'Bosch EDC17C06','Bosch EDC17'),
('BMW','5 Series F10','520d 2.0','N47D20',135,184,181,'Diesel',2010,2014,'Bosch EDC17C06','Bosch EDC17'),
('BMW','5 Series F10','520d 2.0','B47D20',140,190,188,'Diesel',2014,2017,'Bosch EDC17C41','Bosch EDC17'),
('BMW','5 Series F10','525d 2.0','B47D20',160,218,215,'Diesel',2014,2017,'Bosch EDC17C41','Bosch EDC17'),
('BMW','5 Series F10','530d 3.0','N57D30',190,258,255,'Diesel',2010,2017,'Bosch EDC17CP02','Bosch EDC17'),
('BMW','5 Series F10','535d 3.0','N57D30S1',230,313,309,'Diesel',2011,2017,'Bosch EDC17CP02','Bosch EDC17'),
('BMW','5 Series F10','M5 4.4','S63B44B',412,560,552,'Petrol',2011,2017,'Bosch MSD85','Bosch MSD85'),

-- ── BMW X3 F25 (2010–2017) ──────────────────────────────────
('BMW','X3 F25','20i 2.0','N20B20',135,184,181,'Petrol',2010,2015,'Bosch MEVD17.2','Bosch MEVD17'),
('BMW','X3 F25','28i 2.0','N20B20',180,245,242,'Petrol',2010,2017,'Bosch MEVD17.2','Bosch MEVD17'),
('BMW','X3 F25','35i 3.0','N55B30',225,306,302,'Petrol',2011,2017,'Bosch MEVD17.2.G','Bosch MEVD17'),
('BMW','X3 F25','18d 2.0','N47D20',105,143,141,'Diesel',2010,2014,'Bosch EDC17C06','Bosch EDC17'),
('BMW','X3 F25','20d 2.0','N47D20',135,184,181,'Diesel',2010,2014,'Bosch EDC17C06','Bosch EDC17'),
('BMW','X3 F25','20d 2.0','B47D20',140,190,188,'Diesel',2014,2017,'Bosch EDC17C41','Bosch EDC17'),
('BMW','X3 F25','30d 3.0','N57D30',190,258,255,'Diesel',2010,2017,'Bosch EDC17CP02','Bosch EDC17'),
('BMW','X3 F25','35d 3.0','N57D30S1',230,313,309,'Diesel',2011,2017,'Bosch EDC17CP02','Bosch EDC17'),

-- ── BMW X5 E70 (2006–2013) ──────────────────────────────────
('BMW','X5 E70','30i 3.0','N52B30',200,272,268,'Petrol',2006,2010,'Bosch MSV80','Bosch MSV70'),
('BMW','X5 E70','35i 3.0','N54B30',225,306,302,'Petrol',2008,2013,'Bosch MSD81','Bosch MSD80'),
('BMW','X5 E70','50i 4.8','N62TUB48',270,367,362,'Petrol',2006,2010,'Bosch ME9.2','Bosch ME9'),
('BMW','X5 E70','30d 3.0','M57D30',173,235,232,'Diesel',2006,2010,'Bosch EDC16CP35','Bosch EDC16'),
('BMW','X5 E70','35d 3.0','M57D30S1',210,286,282,'Diesel',2007,2013,'Bosch EDC16CP35','Bosch EDC16'),
('BMW','X5 E70','40d 3.0','N57D30S1',225,306,302,'Diesel',2010,2013,'Bosch EDC17CP02','Bosch EDC17'),

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  MERCEDES-BENZ                                              ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── Mercedes A-Class W168/W169 ──────────────────────────────
('Mercedes-Benz','A-Class W169','A180 CDI 2.0','OM640',80,109,107,'Diesel',2005,2012,'Bosch EDC16C2','Bosch EDC16'),
('Mercedes-Benz','A-Class W169','A200 CDI 2.0','OM640',103,140,138,'Diesel',2005,2012,'Bosch EDC16C2','Bosch EDC16'),
('Mercedes-Benz','A-Class W169','A180 1.7','M266.920',85,116,114,'Petrol',2004,2012,'Siemens SIM266','Siemens SIM'),

-- ── Mercedes A-Class W176 ────────────────────────────────────
('Mercedes-Benz','A-Class W176','A180 CDI 1.5','OM607',80,109,107,'Diesel',2012,2018,'Continental A2C','Continental'),
('Mercedes-Benz','A-Class W176','A200 CDI 2.1','OM651',100,136,134,'Diesel',2012,2018,'Bosch EDC17C66','Bosch EDC17'),
('Mercedes-Benz','A-Class W176','A220 CDI 2.1','OM651',125,170,168,'Diesel',2012,2018,'Bosch EDC17C66','Bosch EDC17'),
('Mercedes-Benz','A-Class W176','A180 1.6','M270.910',90,122,120,'Petrol',2012,2018,'Bosch ME17.7.5','Bosch ME17'),
('Mercedes-Benz','A-Class W176','A200 1.6','M270.910',115,156,154,'Petrol',2012,2018,'Bosch ME17.7.5','Bosch ME17'),
('Mercedes-Benz','A-Class W176','A250 2.0','M270.920',155,211,208,'Petrol',2012,2018,'Bosch ME17.7.5','Bosch ME17'),
('Mercedes-Benz','A-Class W176','A45 AMG 2.0','M133.980',265,360,355,'Petrol',2013,2018,'Bosch ME17.7.5','Bosch ME17'),

-- ── Mercedes C-Class W204 ────────────────────────────────────
('Mercedes-Benz','C-Class W204','C180 CGI 1.8','M271.910',115,156,154,'Petrol',2007,2014,'Bosch ME17.7.3','Bosch ME17'),
('Mercedes-Benz','C-Class W204','C200 CGI 1.8','M271.950',135,184,181,'Petrol',2007,2014,'Bosch ME17.7.3','Bosch ME17'),
('Mercedes-Benz','C-Class W204','C250 CGI 1.8','M271.960',150,204,201,'Petrol',2008,2014,'Bosch ME17.7.3','Bosch ME17'),
('Mercedes-Benz','C-Class W204','C180 CDI 2.1','OM651.913',88,120,118,'Diesel',2008,2014,'Bosch EDC17C66','Bosch EDC17'),
('Mercedes-Benz','C-Class W204','C200 CDI 2.1','OM651.913',100,136,134,'Diesel',2007,2014,'Bosch EDC17C66','Bosch EDC17'),
('Mercedes-Benz','C-Class W204','C220 CDI 2.1','OM651.916',125,170,168,'Diesel',2007,2014,'Bosch EDC17C66','Bosch EDC17'),
('Mercedes-Benz','C-Class W204','C250 CDI 2.1','OM651.916',150,204,201,'Diesel',2009,2014,'Bosch EDC17C66','Bosch EDC17'),
('Mercedes-Benz','C-Class W204','C63 AMG 6.2 V8','M156.983',336,457,451,'Petrol',2007,2014,'Bosch ME2.8.1','Bosch ME2'),

-- ── Mercedes C-Class W205 ────────────────────────────────────
('Mercedes-Benz','C-Class W205','C180 1.6','M274.910',115,156,154,'Petrol',2014,2021,'Bosch ME17.9.7','Bosch ME17'),
('Mercedes-Benz','C-Class W205','C200 2.0','M274.920',135,184,181,'Petrol',2014,2021,'Bosch ME17.9.7','Bosch ME17'),
('Mercedes-Benz','C-Class W205','C250 2.0','M274.920',155,211,208,'Petrol',2014,2021,'Bosch ME17.9.7','Bosch ME17'),
('Mercedes-Benz','C-Class W205','C300 2.0','M274.920',180,245,242,'Petrol',2015,2021,'Bosch ME17.9.7','Bosch ME17'),
('Mercedes-Benz','C-Class W205','C180 CDI 2.1','OM651.916',88,120,118,'Diesel',2014,2018,'Bosch EDC17C66','Bosch EDC17'),
('Mercedes-Benz','C-Class W205','C200 CDI 2.1','OM651.916',100,136,134,'Diesel',2014,2018,'Bosch EDC17C66','Bosch EDC17'),
('Mercedes-Benz','C-Class W205','C220 CDI 2.1','OM651.916',125,170,168,'Diesel',2014,2018,'Bosch EDC17C66','Bosch EDC17'),
('Mercedes-Benz','C-Class W205','C250 CDI 2.1','OM651.916',150,204,201,'Diesel',2014,2018,'Bosch EDC17C66','Bosch EDC17'),
('Mercedes-Benz','C-Class W205','C220d 2.0','OM654.920',125,170,168,'Diesel',2018,2021,'Bosch MD1CP001','Bosch MD1'),
('Mercedes-Benz','C-Class W205','C300d 2.0','OM654.920',180,245,242,'Diesel',2018,2021,'Bosch MD1CP001','Bosch MD1'),
('Mercedes-Benz','C-Class W205','C43 AMG 3.0 V6','M276.823',270,367,362,'Petrol',2016,2021,'Bosch ME17.9.7','Bosch ME17'),
('Mercedes-Benz','C-Class W205','C63 AMG 4.0 V8','M177.980',350,476,469,'Petrol',2014,2021,'Bosch ME17.9.7','Bosch ME17'),
('Mercedes-Benz','C-Class W205','C63S AMG 4.0 V8','M177.980',375,510,503,'Petrol',2014,2021,'Bosch ME17.9.7','Bosch ME17'),

-- ── Mercedes E-Class W212 ────────────────────────────────────
('Mercedes-Benz','E-Class W212','E220 CDI 2.1','OM651.924',125,170,168,'Diesel',2009,2016,'Bosch EDC17C66','Bosch EDC17'),
('Mercedes-Benz','E-Class W212','E250 CDI 2.1','OM651.924',150,204,201,'Diesel',2009,2016,'Bosch EDC17C66','Bosch EDC17'),
('Mercedes-Benz','E-Class W212','E300 CDI 3.0','OM642.834',170,231,228,'Diesel',2009,2016,'Bosch EDC17C57','Bosch EDC17'),
('Mercedes-Benz','E-Class W212','E350 CDI 3.0','OM642.836',195,265,261,'Diesel',2009,2016,'Bosch EDC17C57','Bosch EDC17'),
('Mercedes-Benz','E-Class W212','E200 CGI 1.8','M271.950',135,184,181,'Petrol',2009,2013,'Bosch ME17.7.3','Bosch ME17'),
('Mercedes-Benz','E-Class W212','E250 CGI 1.8','M271.860',150,204,201,'Petrol',2009,2013,'Bosch ME17.7.3','Bosch ME17'),
('Mercedes-Benz','E-Class W212','E63 AMG 6.2 V8','M156.985',336,457,451,'Petrol',2009,2013,'Bosch ME2.8.1','Bosch ME2'),

-- ── Mercedes Sprinter W906 ───────────────────────────────────
('Mercedes-Benz','Sprinter W906','213 CDI 2.1','OM651.940',95,129,127,'Diesel',2009,2018,'Bosch EDC17CP01','Bosch EDC17'),
('Mercedes-Benz','Sprinter W906','216 CDI 2.1','OM651.940',120,163,161,'Diesel',2009,2018,'Bosch EDC17CP01','Bosch EDC17'),
('Mercedes-Benz','Sprinter W906','219 CDI 3.0','OM642.993',140,190,188,'Diesel',2006,2018,'Bosch EDC16CP31','Bosch EDC16'),
('Mercedes-Benz','Sprinter W906','313 CDI 2.1','OM651.956',95,129,127,'Diesel',2009,2018,'Bosch EDC17CP01','Bosch EDC17'),
('Mercedes-Benz','Sprinter W906','316 CDI 2.1','OM651.956',120,163,161,'Diesel',2009,2018,'Bosch EDC17CP01','Bosch EDC17'),
('Mercedes-Benz','Sprinter W906','319 CDI 3.0','OM642.993',140,190,188,'Diesel',2006,2018,'Bosch EDC16CP31','Bosch EDC16'),
('Mercedes-Benz','Sprinter W906','324 CDI 2.1','OM651.956',130,177,175,'Diesel',2013,2018,'Bosch EDC17CP01','Bosch EDC17'),

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  VOLKSWAGEN                                                 ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── VW Golf Mk6 (2008–2012) ─────────────────────────────────
('Volkswagen','Golf Mk6','1.4 TSI 122','CAVD',90,122,120,'Petrol',2008,2012,'Bosch MED17.5.5','Bosch MED17'),
('Volkswagen','Golf Mk6','1.4 TSI 160','CAVC',118,160,158,'Petrol',2008,2012,'Bosch MED17.5.5','Bosch MED17'),
('Volkswagen','Golf Mk6','1.6 TDI 90','CAYB',66,90,89,'Diesel',2009,2012,'Bosch EDC17C46','Bosch EDC17'),
('Volkswagen','Golf Mk6','1.6 TDI 105','CAYC',77,105,104,'Diesel',2009,2012,'Bosch EDC17C46','Bosch EDC17'),
('Volkswagen','Golf Mk6','2.0 TDI 110','CFHC',81,110,109,'Diesel',2008,2012,'Bosch EDC17C46','Bosch EDC17'),
('Volkswagen','Golf Mk6','2.0 TDI 140','CBDB',103,140,138,'Diesel',2008,2012,'Bosch EDC17C46','Bosch EDC17'),
('Volkswagen','Golf Mk6','2.0 TDI 170','CFGB',125,170,168,'Diesel',2009,2012,'Bosch EDC17C46','Bosch EDC17'),
('Volkswagen','Golf Mk6','GTI 2.0 TSI 210','CCZB',155,211,208,'Petrol',2009,2013,'Bosch MED17.5','Bosch MED17'),
('Volkswagen','Golf Mk6','GTD 2.0 TDI 170','CBBB',125,170,168,'Diesel',2009,2013,'Bosch EDC17C46','Bosch EDC17'),
('Volkswagen','Golf Mk6','R 2.0 TSI 270','CDLG',199,271,267,'Petrol',2010,2013,'Bosch MED17.5','Bosch MED17'),

-- ── VW Golf Mk7 (2012–2020) ─────────────────────────────────
('Volkswagen','Golf Mk7','1.0 TSI 85','CHZB',63,85,84,'Petrol',2014,2020,'Bosch MED17.5.25','Bosch MED17'),
('Volkswagen','Golf Mk7','1.0 TSI 110','CHZC',81,110,108,'Petrol',2016,2020,'Bosch MED17.5.25','Bosch MED17'),
('Volkswagen','Golf Mk7','1.2 TSI 85','CJZB',63,85,84,'Petrol',2012,2016,'Bosch MED17.5.21','Bosch MED17'),
('Volkswagen','Golf Mk7','1.2 TSI 110','CYVB',81,110,108,'Petrol',2012,2016,'Bosch MED17.5.21','Bosch MED17'),
('Volkswagen','Golf Mk7','1.4 TSI 125','CZCA',92,125,123,'Petrol',2012,2020,'Bosch MED17.5.21','Bosch MED17'),
('Volkswagen','Golf Mk7','1.4 TSI 150','CZDA',110,150,148,'Petrol',2014,2020,'Simos 12.1','Simos'),
('Volkswagen','Golf Mk7','1.5 TSI 130','DPCA',96,130,128,'Petrol',2017,2020,'Bosch MG1CS011','Bosch MG1'),
('Volkswagen','Golf Mk7','1.5 TSI 150','DADA',110,150,148,'Petrol',2017,2020,'Bosch MG1CS011','Bosch MG1'),
('Volkswagen','Golf Mk7','1.6 TDI 90','CLHA',66,90,89,'Diesel',2012,2016,'Bosch EDC17C46','Bosch EDC17'),
('Volkswagen','Golf Mk7','1.6 TDI 105','CLHB',77,105,104,'Diesel',2012,2016,'Bosch EDC17C46','Bosch EDC17'),
('Volkswagen','Golf Mk7','2.0 TDI 110','CKFC',81,110,109,'Diesel',2012,2015,'Bosch EDC17C46','Bosch EDC17'),
('Volkswagen','Golf Mk7','2.0 TDI 150','CRBC',110,150,148,'Diesel',2013,2020,'Bosch EDC17C64','Bosch EDC17'),
('Volkswagen','Golf Mk7','2.0 TDI 184','CUPA',135,184,181,'Diesel',2014,2020,'Bosch EDC17C64','Bosch EDC17'),
('Volkswagen','Golf Mk7','GTI 2.0 TSI 220','CHHA',162,220,217,'Petrol',2012,2017,'Simos 18.1','Simos'),
('Volkswagen','Golf Mk7','GTI Performance 2.0 TSI 230','CHHA',169,230,227,'Petrol',2015,2017,'Simos 18.1','Simos'),
('Volkswagen','Golf Mk7','GTI 2.0 TSI 245','DNFA',180,245,242,'Petrol',2017,2020,'Simos 18.10','Simos'),
('Volkswagen','Golf Mk7','GTD 2.0 TDI 184','CUPA',135,184,181,'Diesel',2012,2020,'Bosch EDC17C64','Bosch EDC17'),
('Volkswagen','Golf Mk7','R 2.0 TSI 300','CJXB',221,300,296,'Petrol',2013,2017,'Simos 18.1','Simos'),
('Volkswagen','Golf Mk7','R 2.0 TSI 310','DNFA',228,310,306,'Petrol',2017,2020,'Simos 18.10','Simos'),

-- ── VW Golf Mk8 (2019–present) ──────────────────────────────
('Volkswagen','Golf Mk8','1.0 TSI 90','DKRA',66,90,89,'Petrol',2019,2024,'Bosch MG1CS111','Bosch MG1'),
('Volkswagen','Golf Mk8','1.0 eTSI 110','DLAA',81,110,108,'Petrol',2020,2024,'Bosch MG1CS111','Bosch MG1'),
('Volkswagen','Golf Mk8','1.5 TSI 130','DPCA',96,130,128,'Petrol',2019,2024,'Bosch MG1CS011','Bosch MG1'),
('Volkswagen','Golf Mk8','1.5 eTSI 150','DADA',110,150,148,'Petrol',2020,2024,'Bosch MG1CS011','Bosch MG1'),
('Volkswagen','Golf Mk8','2.0 TDI 115','DTRC',85,116,114,'Diesel',2019,2024,'Bosch MD1CS004','Bosch MD1'),
('Volkswagen','Golf Mk8','2.0 TDI 150','DTSC',110,150,148,'Diesel',2019,2024,'Bosch MD1CS004','Bosch MD1'),
('Volkswagen','Golf Mk8','GTI 2.0 TSI 245','DNFA',180,245,242,'Petrol',2020,2024,'Simos 18.10','Simos'),
('Volkswagen','Golf Mk8','GTI Clubsport 2.0 TSI 300','DKZB',221,300,296,'Petrol',2020,2024,'Simos 19.3','Simos'),
('Volkswagen','Golf Mk8','GTD 2.0 TDI 200','DTSC',150,200,197,'Diesel',2021,2024,'Bosch MD1CS004','Bosch MD1'),
('Volkswagen','Golf Mk8','R 2.0 TSI 320','DRLA',235,320,316,'Petrol',2021,2024,'Simos 19.3','Simos'),

-- ── VW Passat B6 (2005–2010) ────────────────────────────────
('Volkswagen','Passat B6','1.4 TSI 122','CAXA',90,122,120,'Petrol',2007,2010,'Bosch MED17.5','Bosch MED17'),
('Volkswagen','Passat B6','1.8 TSI 160','BZB',118,160,158,'Petrol',2005,2010,'Bosch MED17.5','Bosch MED17'),
('Volkswagen','Passat B6','2.0 TSI 200','BWA',147,200,197,'Petrol',2005,2010,'Bosch MED9.1','Bosch MED9'),
('Volkswagen','Passat B6','1.6 TDI 105','CAYC',77,105,104,'Diesel',2008,2010,'Bosch EDC17C46','Bosch EDC17'),
('Volkswagen','Passat B6','1.9 TDI 105','BXE',77,105,104,'Diesel',2005,2008,'Bosch EDC16U1','Bosch EDC16'),
('Volkswagen','Passat B6','2.0 TDI 136','BKP',100,136,134,'Diesel',2005,2008,'Bosch EDC16U1','Bosch EDC16'),
('Volkswagen','Passat B6','2.0 TDI 140','CBD',103,140,138,'Diesel',2007,2010,'Bosch EDC17C46','Bosch EDC17'),
('Volkswagen','Passat B6','2.0 TDI 170','CBBB',125,170,168,'Diesel',2008,2010,'Bosch EDC17C46','Bosch EDC17'),

-- ── VW Passat B7 (2010–2015) ────────────────────────────────
('Volkswagen','Passat B7','1.4 TSI 122','CAXA',90,122,120,'Petrol',2010,2015,'Bosch MED17.5.5','Bosch MED17'),
('Volkswagen','Passat B7','1.8 TSI 160','CDAA',118,160,158,'Petrol',2010,2015,'Bosch MED17.5.5','Bosch MED17'),
('Volkswagen','Passat B7','2.0 TSI 200','CCZB',147,200,197,'Petrol',2010,2015,'Bosch MED17.5','Bosch MED17'),
('Volkswagen','Passat B7','1.6 TDI 105','CAYC',77,105,104,'Diesel',2010,2015,'Bosch EDC17C46','Bosch EDC17'),
('Volkswagen','Passat B7','2.0 TDI 140','CFFE',103,140,138,'Diesel',2010,2015,'Bosch EDC17C46','Bosch EDC17'),
('Volkswagen','Passat B7','2.0 TDI 170','CFGB',125,170,168,'Diesel',2010,2015,'Bosch EDC17C46','Bosch EDC17'),

-- ── VW Passat B8 (2014–present) ─────────────────────────────
('Volkswagen','Passat B8','1.4 TSI 125','CZCA',92,125,123,'Petrol',2014,2019,'Bosch MED17.5.21','Bosch MED17'),
('Volkswagen','Passat B8','1.5 TSI 150','DADA',110,150,148,'Petrol',2019,2024,'Bosch MG1CS011','Bosch MG1'),
('Volkswagen','Passat B8','2.0 TSI 220','CHHB',162,220,217,'Petrol',2014,2019,'Simos 18.1','Simos'),
('Volkswagen','Passat B8','1.6 TDI 120','DCXA',88,120,118,'Diesel',2014,2019,'Bosch EDC17C64','Bosch EDC17'),
('Volkswagen','Passat B8','2.0 TDI 150','CRKB',110,150,148,'Diesel',2014,2019,'Bosch EDC17C64','Bosch EDC17'),
('Volkswagen','Passat B8','2.0 TDI 190','CUNA',140,190,188,'Diesel',2014,2019,'Bosch EDC17C74','Bosch EDC17'),
('Volkswagen','Passat B8','2.0 TDI 240 R-Line','DFHA',176,240,237,'Diesel',2019,2024,'Bosch MD1CS004','Bosch MD1'),

-- ── VW Polo Mk5 6R (2009–2018) ──────────────────────────────
('Volkswagen','Polo Mk5 6R','1.2 TSI 90','CBZB',66,90,89,'Petrol',2009,2014,'Bosch MED17.5.5','Bosch MED17'),
('Volkswagen','Polo Mk5 6R','1.2 TSI 105','CBZC',77,105,104,'Petrol',2009,2014,'Bosch MED17.5.5','Bosch MED17'),
('Volkswagen','Polo Mk5 6R','1.4 TSI GTI 180','CTHE',132,180,178,'Petrol',2010,2018,'Bosch MED17.5.5','Bosch MED17'),
('Volkswagen','Polo Mk5 6R','1.2 TDI 75','CFWA',55,75,74,'Diesel',2009,2014,'Bosch EDC17C46','Bosch EDC17'),
('Volkswagen','Polo Mk5 6R','1.6 TDI 90','CAYB',66,90,89,'Diesel',2009,2018,'Bosch EDC17C46','Bosch EDC17'),
('Volkswagen','Polo Mk5 6R','1.6 TDI 105','CAYC',77,105,104,'Diesel',2009,2018,'Bosch EDC17C46','Bosch EDC17'),

-- ── VW Tiguan Mk1 5N (2007–2016) ────────────────────────────
('Volkswagen','Tiguan Mk1','1.4 TSI 122','CAXA',90,122,120,'Petrol',2008,2011,'Bosch MED17.5','Bosch MED17'),
('Volkswagen','Tiguan Mk1','2.0 TSI 200','BWA',147,200,197,'Petrol',2007,2011,'Bosch MED9.1','Bosch MED9'),
('Volkswagen','Tiguan Mk1','2.0 TSI 211','CCZB',155,211,208,'Petrol',2011,2016,'Bosch MED17.5','Bosch MED17'),
('Volkswagen','Tiguan Mk1','1.6 TDI 105','CAYC',77,105,104,'Diesel',2011,2016,'Bosch EDC17C46','Bosch EDC17'),
('Volkswagen','Tiguan Mk1','2.0 TDI 110','CFHC',81,110,109,'Diesel',2007,2011,'Bosch EDC17C46','Bosch EDC17'),
('Volkswagen','Tiguan Mk1','2.0 TDI 140','CBAB',103,140,138,'Diesel',2008,2016,'Bosch EDC17C46','Bosch EDC17'),
('Volkswagen','Tiguan Mk1','2.0 TDI 170','CFGB',125,170,168,'Diesel',2011,2016,'Bosch EDC17C46','Bosch EDC17'),

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  SEAT                                                       ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── Seat Leon Mk2 1P ────────────────────────────────────────
('SEAT','Leon Mk2 1P','1.6 TDI 105','CAYC',77,105,104,'Diesel',2009,2012,'Bosch EDC17C46','Bosch EDC17'),
('SEAT','Leon Mk2 1P','2.0 TDI 140','CBD',103,140,138,'Diesel',2005,2012,'Bosch EDC17C46','Bosch EDC17'),
('SEAT','Leon Mk2 1P','2.0 TDI 170','CFGB',125,170,168,'Diesel',2009,2012,'Bosch EDC17C46','Bosch EDC17'),
('SEAT','Leon Mk2 1P','1.4 TSI 125','CAXA',90,125,123,'Petrol',2006,2012,'Bosch MED17.5','Bosch MED17'),
('SEAT','Leon Mk2 1P','FR 2.0 TSI 200','BWA',147,200,197,'Petrol',2006,2012,'Bosch MED9.1','Bosch MED9'),
('SEAT','Leon Mk2 1P','Cupra 2.0 TSI 265','CDLH',195,265,261,'Petrol',2010,2012,'Bosch MED17.5','Bosch MED17'),

-- ── Seat Leon Mk3 5F ────────────────────────────────────────
('SEAT','Leon Mk3 5F','1.2 TSI 85','CJZB',63,85,84,'Petrol',2012,2016,'Bosch MED17.5.21','Bosch MED17'),
('SEAT','Leon Mk3 5F','1.4 TSI 125','CZCA',92,125,123,'Petrol',2012,2020,'Bosch MED17.5.21','Bosch MED17'),
('SEAT','Leon Mk3 5F','1.8 TSI FR 180','CJSA',132,180,178,'Petrol',2012,2020,'Simos 12.1','Simos'),
('SEAT','Leon Mk3 5F','1.6 TDI 90','CLHA',66,90,89,'Diesel',2012,2020,'Bosch EDC17C46','Bosch EDC17'),
('SEAT','Leon Mk3 5F','1.6 TDI 105','CLHB',77,105,104,'Diesel',2012,2020,'Bosch EDC17C46','Bosch EDC17'),
('SEAT','Leon Mk3 5F','2.0 TDI 150','CRBC',110,150,148,'Diesel',2013,2020,'Bosch EDC17C64','Bosch EDC17'),
('SEAT','Leon Mk3 5F','2.0 TDI 184','CUPA',135,184,181,'Diesel',2014,2020,'Bosch EDC17C64','Bosch EDC17'),
('SEAT','Leon Mk3 5F','FR 1.8 TSI 180','CJSA',132,180,178,'Petrol',2013,2020,'Simos 12.1','Simos'),
('SEAT','Leon Mk3 5F','Cupra 2.0 TSI 280','CJXB',206,280,276,'Petrol',2014,2017,'Simos 18.1','Simos'),
('SEAT','Leon Mk3 5F','Cupra 2.0 TSI 300','CJXB',221,300,296,'Petrol',2017,2020,'Simos 18.1','Simos'),

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  SKODA                                                      ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── Skoda Octavia Mk2 1Z ────────────────────────────────────
('Skoda','Octavia Mk2 1Z','1.6 TDI 105','CAYC',77,105,104,'Diesel',2008,2013,'Bosch EDC17C46','Bosch EDC17'),
('Skoda','Octavia Mk2 1Z','2.0 TDI 140','BKD',103,140,138,'Diesel',2004,2010,'Bosch EDC16U1','Bosch EDC16'),
('Skoda','Octavia Mk2 1Z','2.0 TDI 170','BMM',125,170,168,'Diesel',2007,2013,'Bosch EDC17C46','Bosch EDC17'),
('Skoda','Octavia Mk2 1Z','1.8 TSI 160','BZB',118,160,158,'Petrol',2007,2013,'Bosch MED17.5','Bosch MED17'),
('Skoda','Octavia Mk2 1Z','vRS 2.0 TSI 200','BWA',147,200,197,'Petrol',2006,2013,'Bosch MED9.1','Bosch MED9'),
('Skoda','Octavia Mk2 1Z','vRS 2.0 TDI 170','CBBB',125,170,168,'Diesel',2009,2013,'Bosch EDC17C46','Bosch EDC17'),

-- ── Skoda Octavia Mk3 5E ────────────────────────────────────
('Skoda','Octavia Mk3 5E','1.0 TSI 115','CHZC',85,115,113,'Petrol',2017,2020,'Bosch MED17.5.25','Bosch MED17'),
('Skoda','Octavia Mk3 5E','1.4 TSI 125','CZCA',92,125,123,'Petrol',2013,2020,'Bosch MED17.5.21','Bosch MED17'),
('Skoda','Octavia Mk3 5E','1.8 TSI 180','CJSA',132,180,178,'Petrol',2013,2020,'Simos 12.1','Simos'),
('Skoda','Octavia Mk3 5E','1.6 TDI 110','CLHA',81,110,108,'Diesel',2013,2020,'Bosch EDC17C46','Bosch EDC17'),
('Skoda','Octavia Mk3 5E','2.0 TDI 150','CRBC',110,150,148,'Diesel',2013,2020,'Bosch EDC17C64','Bosch EDC17'),
('Skoda','Octavia Mk3 5E','2.0 TDI 184','CUPA',135,184,181,'Diesel',2014,2020,'Bosch EDC17C64','Bosch EDC17'),
('Skoda','Octavia Mk3 5E','vRS 2.0 TSI 230','CHHA',169,230,227,'Petrol',2013,2020,'Simos 18.1','Simos'),
('Skoda','Octavia Mk3 5E','vRS 2.0 TDI 184','CUPA',135,184,181,'Diesel',2013,2020,'Bosch EDC17C64','Bosch EDC17'),

-- ── Skoda Superb B6/B8 ──────────────────────────────────────
('Skoda','Superb Mk2 3T','1.8 TSI 160','BZB',118,160,158,'Petrol',2008,2015,'Bosch MED17.5','Bosch MED17'),
('Skoda','Superb Mk2 3T','2.0 TSI 200','CCZB',147,200,197,'Petrol',2008,2015,'Bosch MED17.5','Bosch MED17'),
('Skoda','Superb Mk2 3T','1.6 TDI 105','CAYC',77,105,104,'Diesel',2010,2015,'Bosch EDC17C46','Bosch EDC17'),
('Skoda','Superb Mk2 3T','2.0 TDI 140','CBAB',103,140,138,'Diesel',2008,2015,'Bosch EDC17C46','Bosch EDC17'),
('Skoda','Superb Mk2 3T','2.0 TDI 177','CFGB',130,177,175,'Diesel',2010,2015,'Bosch EDC17C46','Bosch EDC17'),
('Skoda','Superb Mk3 3V','2.0 TSI 220','CHHB',162,220,217,'Petrol',2015,2024,'Simos 18.1','Simos'),
('Skoda','Superb Mk3 3V','2.0 TDI 150','CRKB',110,150,148,'Diesel',2015,2024,'Bosch EDC17C64','Bosch EDC17'),
('Skoda','Superb Mk3 3V','2.0 TDI 190','CUNA',140,190,188,'Diesel',2015,2024,'Bosch EDC17C74','Bosch EDC17'),
('Skoda','Superb Mk3 3V','2.0 TDI 240 Sportline','DFHA',176,240,237,'Diesel',2019,2024,'Bosch MD1CS004','Bosch MD1'),

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  FORD                                                       ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── Ford Focus Mk2 (2004–2011) ──────────────────────────────
('Ford','Focus Mk2','1.6 TDCi 90','G8DA',66,90,89,'Diesel',2004,2011,'Siemens SID803A','Siemens SID'),
('Ford','Focus Mk2','1.6 TDCi 109','G8DA',80,109,107,'Diesel',2004,2011,'Siemens SID803A','Siemens SID'),
('Ford','Focus Mk2','1.8 TDCi 115','KKDA',85,115,113,'Diesel',2004,2011,'Delphi DCM3.5','Delphi DCM'),
('Ford','Focus Mk2','2.0 TDCi 136','G6DA',100,136,134,'Diesel',2004,2011,'Delphi DCM3.5','Delphi DCM'),
('Ford','Focus Mk2','2.0 TDCi 143','UFDA',105,143,141,'Diesel',2007,2011,'Delphi DCM3.5','Delphi DCM'),
('Ford','Focus Mk2','1.6 Ti-VCT 115','HXDA',85,115,113,'Petrol',2004,2011,'Bosch ME9.0','Bosch ME9'),
('Ford','Focus Mk2','2.0 ST 225','AODB',166,225,222,'Petrol',2005,2011,'Bosch MED9.0','Bosch MED9'),
('Ford','Focus Mk2','RS 2.5T 305','HWDA',224,305,301,'Petrol',2009,2011,'Bosch ME9.0','Bosch ME9'),

-- ── Ford Focus Mk3 (2011–2018) ──────────────────────────────
('Ford','Focus Mk3','1.5 TDCi 95','XWDC',70,95,94,'Diesel',2014,2018,'Delphi DCM3.5AP','Delphi DCM'),
('Ford','Focus Mk3','1.5 TDCi 120','XWDC',88,120,118,'Diesel',2014,2018,'Delphi DCM3.5AP','Delphi DCM'),
('Ford','Focus Mk3','1.6 TDCi 95','T1DA',70,95,94,'Diesel',2011,2014,'Bosch EDC17C10','Bosch EDC17'),
('Ford','Focus Mk3','1.6 TDCi 115','T1DA',85,115,113,'Diesel',2011,2014,'Bosch EDC17C10','Bosch EDC17'),
('Ford','Focus Mk3','2.0 TDCi 115','UFCA',85,115,113,'Diesel',2012,2018,'Delphi DCM3.5AP','Delphi DCM'),
('Ford','Focus Mk3','2.0 TDCi 150','UFCA',110,150,148,'Diesel',2012,2018,'Delphi DCM3.5AP','Delphi DCM'),
('Ford','Focus Mk3','1.0 EcoBoost 100','M2DA',74,100,99,'Petrol',2011,2018,'Bosch MED17.0.7','Bosch MED17'),
('Ford','Focus Mk3','1.0 EcoBoost 125','M2DA',92,125,123,'Petrol',2011,2018,'Bosch MED17.0.7','Bosch MED17'),
('Ford','Focus Mk3','ST 2.0 EcoBoost 250','TNDA',184,250,247,'Petrol',2012,2018,'Bosch MED17.0.7','Bosch MED17'),
('Ford','Focus Mk3','RS 2.3 EcoBoost 350','EAD',257,350,345,'Petrol',2016,2018,'Bosch MED17.3','Bosch MED17'),

-- ── Ford Fiesta Mk6/Mk7 (2008–2017) ─────────────────────────
('Ford','Fiesta Mk6','1.4 TDCi 70','F6JA',51,70,69,'Diesel',2008,2017,'Siemens SID803','Siemens SID'),
('Ford','Fiesta Mk6','1.5 TDCi 75','UGJB',55,75,74,'Diesel',2012,2017,'Delphi DCM3.5AP','Delphi DCM'),
('Ford','Fiesta Mk6','1.5 TDCi 95','UGJB',70,95,94,'Diesel',2012,2017,'Delphi DCM3.5AP','Delphi DCM'),
('Ford','Fiesta Mk6','1.0 EcoBoost 100','M1JA',74,100,99,'Petrol',2012,2017,'Bosch MED17.0.7','Bosch MED17'),
('Ford','Fiesta Mk6','1.0 EcoBoost 125','M1JA',92,125,123,'Petrol',2012,2017,'Bosch MED17.0.7','Bosch MED17'),
('Ford','Fiesta Mk6','ST 1.6 EcoBoost 182','JTJA',134,182,179,'Petrol',2013,2017,'Bosch MED17.0.7','Bosch MED17'),

-- ── Ford Mondeo Mk4 (2007–2014) ─────────────────────────────
('Ford','Mondeo Mk4','1.6 TDCi 115','T1DA',85,115,113,'Diesel',2012,2014,'Bosch EDC17C10','Bosch EDC17'),
('Ford','Mondeo Mk4','2.0 TDCi 115','HJBA',85,115,113,'Diesel',2007,2012,'Siemens SID206','Siemens SID'),
('Ford','Mondeo Mk4','2.0 TDCi 140','HJBA',103,140,138,'Diesel',2007,2012,'Siemens SID206','Siemens SID'),
('Ford','Mondeo Mk4','2.0 TDCi 163','UFBA',120,163,161,'Diesel',2010,2014,'Delphi DCM3.5','Delphi DCM'),
('Ford','Mondeo Mk4','2.2 TDCi 200','Q4BA',147,200,197,'Diesel',2007,2012,'Siemens SID206','Siemens SID'),
('Ford','Mondeo Mk4','2.0 EcoBoost 240','N7BA',177,240,237,'Petrol',2010,2014,'Bosch MED17.0.7','Bosch MED17'),

-- ── Ford Transit Custom (2012–present) ──────────────────────
('Ford','Transit Custom','2.0 TDCi 105','BJGB',77,105,104,'Diesel',2016,2024,'Delphi DCM3.5AP','Delphi DCM'),
('Ford','Transit Custom','2.0 TDCi 130','BJGB',96,130,128,'Diesel',2016,2024,'Delphi DCM3.5AP','Delphi DCM'),
('Ford','Transit Custom','2.0 TDCi 170','BJGB',125,170,168,'Diesel',2019,2024,'Delphi DCM3.5AP','Delphi DCM'),
('Ford','Transit Custom','2.2 TDCi 100','DRFA',74,100,99,'Diesel',2012,2016,'Delphi DCM3.5','Delphi DCM'),
('Ford','Transit Custom','2.2 TDCi 125','DRFA',92,125,123,'Diesel',2012,2016,'Delphi DCM3.5','Delphi DCM'),
('Ford','Transit Custom','2.2 TDCi 155','DRFA',114,155,153,'Diesel',2012,2016,'Delphi DCM3.5','Delphi DCM'),

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  RENAULT                                                    ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── Renault Megane Mk2/Mk3 ──────────────────────────────────
('Renault','Megane Mk2','1.5 dCi 85','K9K',63,85,84,'Diesel',2002,2009,'Siemens SID301','Siemens SID'),
('Renault','Megane Mk2','1.5 dCi 105','K9K',77,105,104,'Diesel',2002,2009,'Siemens SID301','Siemens SID'),
('Renault','Megane Mk2','1.9 dCi 130','F9Q',96,130,128,'Diesel',2002,2009,'Bosch EDC15C3','Bosch EDC15'),
('Renault','Megane Mk2','RS 2.0T 225','F4Rt',165,225,222,'Petrol',2004,2009,'Siemens Fenix5','Siemens Fenix'),
('Renault','Megane Mk3','1.5 dCi 90','K9K',66,90,89,'Diesel',2008,2016,'Siemens SID305','Siemens SID'),
('Renault','Megane Mk3','1.5 dCi 110','K9K',81,110,108,'Diesel',2008,2016,'Siemens SID305','Siemens SID'),
('Renault','Megane Mk3','2.0 dCi 150','M9R',110,150,148,'Diesel',2008,2016,'Bosch EDC17C42','Bosch EDC17'),
('Renault','Megane Mk3','RS 2.0T 250','F4Rt',184,250,247,'Petrol',2010,2016,'Bosch ME17.4.2','Bosch ME17'),
('Renault','Megane Mk3','RS Trophy 2.0T 265','F4Rt',195,265,261,'Petrol',2011,2016,'Bosch ME17.4.2','Bosch ME17'),

-- ── Renault Clio Mk3/Mk4 ────────────────────────────────────
('Renault','Clio Mk3','1.5 dCi 70','K9K',51,70,69,'Diesel',2005,2012,'Siemens SID301','Siemens SID'),
('Renault','Clio Mk3','1.5 dCi 85','K9K',63,85,84,'Diesel',2005,2012,'Siemens SID301','Siemens SID'),
('Renault','Clio Mk3','RS 2.0 197','F4Rt',145,197,194,'Petrol',2006,2012,'Siemens Fenix5','Siemens Fenix'),
('Renault','Clio Mk4','0.9 TCe 90','H4Bt',66,90,89,'Petrol',2012,2019,'Continental EMS3150','Continental'),
('Renault','Clio Mk4','1.2 TCe 120','D4F',88,120,118,'Petrol',2012,2019,'Continental EMS3150','Continental'),
('Renault','Clio Mk4','1.5 dCi 75','K9K',55,75,74,'Diesel',2012,2019,'Siemens SID305','Siemens SID'),
('Renault','Clio Mk4','1.5 dCi 90','K9K',66,90,89,'Diesel',2012,2019,'Siemens SID305','Siemens SID'),
('Renault','Clio Mk4','RS 1.6T 200','M5Mt',147,200,197,'Petrol',2013,2019,'Continental EMS3150','Continental'),
('Renault','Clio Mk4','RS Trophy 1.6T 220','M5Mt',162,220,217,'Petrol',2015,2019,'Continental EMS3150','Continental'),

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  VOLVO                                                      ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── Volvo V70/S60 P24 (2000–2007) ──────────────────────────
('Volvo','V70 Mk2','D5 2.4 163','D5244T',120,163,161,'Diesel',2001,2007,'Bosch EDC15C11','Bosch EDC15'),
('Volvo','S60 Mk1','D5 2.4 163','D5244T',120,163,161,'Diesel',2001,2009,'Bosch EDC15C11','Bosch EDC15'),
('Volvo','S60 Mk1','T5 2.4 250','B5244T5',184,250,247,'Petrol',2001,2009,'Bosch ME9.0','Bosch ME9'),

-- ── Volvo V70/S60/XC60/XC90 (2007–2017) ────────────────────
('Volvo','V70 Mk3','D3 2.0 163','D4204T',120,163,161,'Diesel',2010,2016,'Bosch EDC17CP48','Bosch EDC17'),
('Volvo','V70 Mk3','D4 2.4 181','D5244T15',133,181,179,'Diesel',2007,2016,'Bosch EDC17CP48','Bosch EDC17'),
('Volvo','V70 Mk3','D5 2.4 205','D5244T15',151,205,202,'Diesel',2007,2016,'Bosch EDC17CP48','Bosch EDC17'),
('Volvo','S60 Mk2','D4 2.0 190','D4204T14',140,190,188,'Diesel',2010,2018,'Bosch EDC17CP48','Bosch EDC17'),
('Volvo','S60 Mk2','T4 2.0 180','B4204T7',132,180,178,'Petrol',2011,2018,'Bosch ME9.0','Bosch ME9'),
('Volvo','S60 Mk2','T5 2.0 254','B4204T7',187,254,251,'Petrol',2011,2018,'Bosch ME9.0','Bosch ME9'),
('Volvo','S60 Mk2','T6 3.0 304','B6304T4',224,304,300,'Petrol',2010,2015,'Bosch ME9.0','Bosch ME9'),
('Volvo','XC60 Mk1','D3 2.0 163','D4204T',120,163,161,'Diesel',2008,2017,'Bosch EDC17CP48','Bosch EDC17'),
('Volvo','XC60 Mk1','D4 2.4 181','D5244T15',133,181,179,'Diesel',2008,2017,'Bosch EDC17CP48','Bosch EDC17'),
('Volvo','XC60 Mk1','D5 2.4 220','D5244T10',162,220,217,'Diesel',2008,2017,'Bosch EDC17CP48','Bosch EDC17'),
('Volvo','XC90 Mk1','D5 2.4 185','D5244T4',136,185,182,'Diesel',2002,2014,'Bosch EDC15C11','Bosch EDC15'),
('Volvo','XC90 Mk1','D5 2.4 200','D5244T7',147,200,197,'Diesel',2006,2014,'Bosch EDC15C11','Bosch EDC15'),
('Volvo','XC90 Mk2','D5 2.0 235','D4204T23',173,235,232,'Diesel',2014,2023,'Bosch EDC17CP48','Bosch EDC17'),
('Volvo','XC90 Mk2','T6 2.0 320','B4204T26',235,320,316,'Petrol',2015,2023,'Bosch ME17.8.6','Bosch ME17'),

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  HYUNDAI / KIA                                              ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── Hyundai i30 / Kia Ceed ──────────────────────────────────
('Hyundai','i30 GD','1.6 CRDi 90','D4FB',66,90,89,'Diesel',2012,2017,'Bosch EDC17C08','Bosch EDC17'),
('Hyundai','i30 GD','1.6 CRDi 110','D4FB',81,110,108,'Diesel',2012,2017,'Bosch EDC17C08','Bosch EDC17'),
('Hyundai','i30 GD','1.6 CRDi 136','D4FC',100,136,134,'Diesel',2012,2017,'Bosch EDC17C08','Bosch EDC17'),
('Hyundai','i30 GD','1.4 T-GDI 140','G4LC',103,140,138,'Petrol',2016,2019,'Bosch MED17.9.8','Bosch MED17'),
('Hyundai','i30 N 2.0T 275','G4KH',202,275,271,'Petrol',2017,2024,'Bosch ME17.9.8','Bosch ME17'),
('Kia','Ceed Mk2','1.6 CRDi 90','D4FB',66,90,89,'Diesel',2012,2018,'Bosch EDC17C08','Bosch EDC17'),
('Kia','Ceed Mk2','1.6 CRDi 110','D4FB',81,110,108,'Diesel',2012,2018,'Bosch EDC17C08','Bosch EDC17'),
('Kia','Ceed Mk2','1.6 CRDi 136','D4FC',100,136,134,'Diesel',2012,2018,'Bosch EDC17C08','Bosch EDC17'),
('Kia','Stinger 3.3 V6T 370','G6DP',272,370,365,'Petrol',2017,2024,'Bosch ME17.9.8','Bosch ME17'),
('Hyundai','Tucson Mk2','2.0 CRDi 185','D4HA',136,185,182,'Diesel',2015,2021,'Bosch EDC17C57','Bosch EDC17'),
('Hyundai','Tucson Mk2','1.6 T-GDI 177','G4FJ',130,177,175,'Petrol',2015,2021,'Bosch ME17.9.8','Bosch ME17'),
('Kia','Sportage Mk4','2.0 CRDi 185','D4HA',136,185,182,'Diesel',2016,2021,'Bosch EDC17C57','Bosch EDC17'),
('Kia','Sportage Mk4','1.6 T-GDI 177','G4FJ',130,177,175,'Petrol',2016,2021,'Bosch ME17.9.8','Bosch ME17'),

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  OPEL / VAUXHALL                                            ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── Opel Astra H/J ──────────────────────────────────────────
('Opel','Astra H','1.7 CDTi 100','Z17DTH',74,100,99,'Diesel',2004,2010,'Bosch EDC16C39','Bosch EDC16'),
('Opel','Astra H','1.9 CDTi 120','Z19DT',88,120,118,'Diesel',2004,2010,'Bosch EDC16C39','Bosch EDC16'),
('Opel','Astra H','1.9 CDTi 150','Z19DTH',110,150,148,'Diesel',2004,2010,'Bosch EDC16C39','Bosch EDC16'),
('Opel','Astra H','2.0 OPC Turbo 240','Z20LEH',177,240,237,'Petrol',2005,2010,'Bosch ME9.6','Bosch ME9'),
('Opel','Astra J','1.6 CDTi 110','B16DTH',81,110,108,'Diesel',2013,2019,'GM E39A','GM E39A'),
('Opel','Astra J','1.7 CDTi 110','A17DTS',81,110,108,'Diesel',2009,2015,'Bosch EDC17C19','Bosch EDC17'),
('Opel','Astra J','2.0 CDTi 165','A20DTH',121,165,163,'Diesel',2009,2015,'Bosch EDC17C19','Bosch EDC17'),
('Opel','Astra J','1.4 Turbo 120','A14NET',88,120,118,'Petrol',2009,2015,'Bosch ME17.9.7','Bosch ME17'),
('Opel','Astra J','1.6 Turbo 170','A16LET',125,170,168,'Petrol',2009,2015,'Bosch ME17.9.7','Bosch ME17'),
('Opel','Astra J','OPC 2.0T 280','A20NFT',206,280,276,'Petrol',2012,2015,'Bosch ME17.9.7','Bosch ME17'),

-- ── Opel Insignia A/B ────────────────────────────────────────
('Opel','Insignia A','2.0 CDTi 110','A20DTH',81,110,108,'Diesel',2008,2017,'Bosch EDC17C19','Bosch EDC17'),
('Opel','Insignia A','2.0 CDTi 130','A20DTH',96,130,128,'Diesel',2008,2017,'Bosch EDC17C19','Bosch EDC17'),
('Opel','Insignia A','2.0 CDTi 160','A20DTH',118,160,158,'Diesel',2008,2017,'Bosch EDC17C19','Bosch EDC17'),
('Opel','Insignia A','2.0 SIDI Turbo 220','A20NFT',162,220,217,'Petrol',2009,2017,'Bosch ME17.9.7','Bosch ME17'),
('Opel','Insignia B','2.0 CDTi 110','B20DTH',81,110,108,'Diesel',2017,2023,'Bosch EDC17C83','Bosch EDC17'),
('Opel','Insignia B','2.0 CDTi 170','B20DTH',125,170,168,'Diesel',2017,2023,'Bosch EDC17C83','Bosch EDC17'),

ON CONFLICT DO NOTHING;

-- ============================================================
-- Summary: ~280 entries added
-- Makes covered: Audi (A4 B8/B9, A5, A6, A7, Q3, Q5, Q7, TT)
--                BMW (1/3/5 Series, X3, X5, M3, M5)
--                Mercedes (A/C/E Class, Sprinter)
--                VW (Golf Mk6/7/8, Passat B6/7/8, Polo, Tiguan)
--                SEAT (Leon Mk2/Mk3), Skoda (Octavia, Superb)
--                Ford (Focus Mk2/3, Fiesta, Mondeo, Transit)
--                Renault (Megane, Clio), Volvo (V70, S60, XC60, XC90)
--                Hyundai/Kia, Opel/Vauxhall
-- ============================================================
