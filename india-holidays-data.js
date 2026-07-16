// India Central Government Gazetted Holidays
// Source: DoPT / Ministry of Personnel official holiday circulars
// Used because public holiday APIs do not provide India data

const INDIA_GAZETTED_HOLIDAYS = {
    2024: [
        { date: '2024-01-26', name: 'Republic Day' },
        { date: '2024-03-25', name: 'Holi' },
        { date: '2024-03-29', name: 'Good Friday' },
        { date: '2024-04-11', name: 'Id-ul-Fitr' },
        { date: '2024-04-17', name: 'Ram Navami' },
        { date: '2024-04-21', name: 'Mahavir Jayanti' },
        { date: '2024-05-23', name: 'Buddha Purnima' },
        { date: '2024-06-17', name: 'Id-ul-Zuha (Bakrid)' },
        { date: '2024-07-17', name: 'Muharram' },
        { date: '2024-08-15', name: 'Independence Day' },
        { date: '2024-08-26', name: 'Janmashtami' },
        { date: '2024-09-16', name: 'Milad-un-Nabi (Id-e-Milad)' },
        { date: '2024-10-02', name: 'Mahatma Gandhi Jayanti' },
        { date: '2024-10-12', name: 'Dussehra' },
        { date: '2024-11-01', name: 'Diwali (Deepavali)' },
        { date: '2024-11-15', name: 'Guru Nanak Jayanti' },
        { date: '2024-12-25', name: 'Christmas Day' }
    ],
    2025: [
        { date: '2025-01-26', name: 'Republic Day' },
        { date: '2025-02-26', name: 'Maha Shivaratri' },
        { date: '2025-03-14', name: 'Holi' },
        { date: '2025-03-31', name: 'Id-ul-Fitr' },
        { date: '2025-04-10', name: 'Mahavir Jayanti' },
        { date: '2025-04-18', name: 'Good Friday' },
        { date: '2025-05-12', name: 'Buddha Purnima' },
        { date: '2025-06-07', name: 'Id-ul-Zuha (Bakrid)' },
        { date: '2025-07-06', name: 'Muharram' },
        { date: '2025-08-15', name: 'Independence Day' },
        { date: '2025-08-16', name: 'Janmashtami' },
        { date: '2025-09-05', name: 'Milad-un-Nabi (Id-e-Milad)' },
        { date: '2025-10-02', name: 'Mahatma Gandhi Jayanti' },
        { date: '2025-10-02', name: 'Dussehra' },
        { date: '2025-10-20', name: 'Diwali (Deepavali)' },
        { date: '2025-11-05', name: 'Guru Nanak Jayanti' },
        { date: '2025-12-25', name: 'Christmas Day' }
    ],
    2026: [
        { date: '2026-01-26', name: 'Republic Day' },
        { date: '2026-03-04', name: 'Holi' },
        { date: '2026-03-21', name: 'Id-ul-Fitr' },
        { date: '2026-03-26', name: 'Ram Navami' },
        { date: '2026-03-31', name: 'Mahavir Jayanti' },
        { date: '2026-04-03', name: 'Good Friday' },
        { date: '2026-05-01', name: 'Buddha Purnima' },
        { date: '2026-05-27', name: 'Id-ul-Zuha (Bakrid)' },
        { date: '2026-06-26', name: 'Muharram' },
        { date: '2026-08-15', name: 'Independence Day' },
        { date: '2026-08-26', name: 'Milad-un-Nabi (Id-e-Milad)' },
        { date: '2026-09-04', name: 'Janmashtami' },
        { date: '2026-10-02', name: 'Mahatma Gandhi Jayanti' },
        { date: '2026-10-20', name: 'Dussehra' },
        { date: '2026-11-08', name: 'Diwali (Deepavali)' },
        { date: '2026-11-24', name: 'Guru Nanak Jayanti' },
        { date: '2026-12-25', name: 'Christmas Day' }
    ],
    2027: [
        { date: '2027-01-26', name: 'Republic Day' },
        { date: '2027-08-15', name: 'Independence Day' },
        { date: '2027-10-02', name: 'Mahatma Gandhi Jayanti' },
        { date: '2027-12-25', name: 'Christmas Day' }
    ]
};

function getIndiaBuiltInHolidays(year) {
    const yearNum = parseInt(year, 10);
    const holidays = INDIA_GAZETTED_HOLIDAYS[yearNum];

    if (holidays && holidays.length > 0) {
        return holidays.map(h => ({
            date: h.date,
            localName: h.name,
            name: h.name,
            global: true,
            source: 'official'
        }));
    }

    // Fallback: three mandatory national holidays for any year
    return [
        { date: `${yearNum}-01-26`, localName: 'Republic Day', name: 'Republic Day', global: true, source: 'official' },
        { date: `${yearNum}-08-15`, localName: 'Independence Day', name: 'Independence Day', global: true, source: 'official' },
        { date: `${yearNum}-10-02`, localName: 'Mahatma Gandhi Jayanti', name: 'Mahatma Gandhi Jayanti', global: true, source: 'official' }
    ];
}
