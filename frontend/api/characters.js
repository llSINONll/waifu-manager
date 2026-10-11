const ANILIST_URL = "https://graphql.anilist.co";
const JIKAN_EDGE_URL = "https://jikan.lucashdo.com/v1";

// Extract birthdays such as "Birthday: September 28th".
function extractBirthday(about = "") {
    const match = about.match(
        /Birthday:\s*([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?/i
    );

    if (!match) {
        return { month: null, day: null };
    }

    const months = {
        january: 1, february: 2, march: 3, april: 4,
        may: 5, june: 6, july: 7, august: 8,
        september: 9, october: 10, november: 11, december: 12
    };

    return {
        month: months[match[1].toLowerCase()] || null,
        day: Number(match[2])
    };
}

export default async function handler(req, res) {
    try {
        const { q, id, source } = req.query;

        // MODE 1: Fetch a full Jikan Edge profile.
        if (id && source === "jikan-edge") {
            const response = await fetch(
                `${JIKAN_EDGE_URL}/characters/${encodeURIComponent(id)}/full`
            );

            if (!response.ok) {
                return res.status(502).json({
                    error: "Failed to fetch character profile",
                    status: response.status
                });
            }

            const result = await response.json();
            const profile = result.data;

            if (!profile) {
                return res.status(502).json({
                    error: "Character profile was empty"
                });
            }

            const about = (profile.about || "")
                .replace(/<[^>]*>/g, "")
                .trim();

            const birthday = extractBirthday(about);

            const cleanName = (profile.name || "")
                .replace(/"[^"]*"/g, "")
                .replace(/\s+/g, " ")
                .trim();

            return res.status(200).json({
                character: {
                    id: String(profile.malId),
                    mal_id: profile.malId,
                    name: cleanName,
                    image:
                        profile.images?.medium ||
                        profile.imageUrl ||
                        "",
                    about,
                    nicknames: [],
                    birthday_month: birthday.month,
                    birthday_day: birthday.day,
                    nameKanji: profile.nameKanji || "",
                    source: "jikan-edge"
                }
            });
        }

        // MODE 2: Search both AniList and Jikan Edge.
        if (!q || !q.trim()) {
            return res.status(400).json({
                error: "Missing search query"
            });
        }

        const searchTerm = q.trim();

        // Run both searches concurrently. One provider failing
        // should not prevent results from the other provider.
        const [aniResult, jikanResult] = await Promise.allSettled([
            (async () => {
                const query = `
                    query ($search: String!) {
                        Page(page: 1, perPage: 10) {
                            characters(search: $search) {
                                id
                                name {
                                    full
                                    alternative
                                }
                                image {
                                    large
                                    medium
                                }
                                description
                                dateOfBirth {
                                    year
                                    month
                                    day
                                }
                            }
                        }
                    }
                `;

                const response = await fetch(ANILIST_URL, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify({
                        query,
                        variables: { search: searchTerm }
                    })
                });

                if (!response.ok) {
                    throw new Error(`AniList returned ${response.status}`);
                }

                const result = await response.json();

                if (result.errors) {
                    throw new Error("AniList GraphQL request failed");
                }

                return result.data?.Page?.characters || [];
            })(),

            (async () => {
                const response = await fetch(
                    `${JIKAN_EDGE_URL}/characters?q=${encodeURIComponent(searchTerm)}`
                );

                if (!response.ok) {
                    throw new Error(`Jikan Edge returned ${response.status}`);
                }

                const result = await response.json();

                return (result.data || []).map(char => ({
                    id: String(char.malId),
                    name: {
                        full: char.name || "Unknown",
                        alternative: []
                    },
                    image: {
                        large: char.imageUrl || "",
                        medium: char.imageUrl || ""
                    },
                    description: "",
                    dateOfBirth: {
                        year: null,
                        month: null,
                        day: null
                    },
                    source: "jikan-edge"
                }));
            })()
        ]);

        const aniCharacters =
            aniResult.status === "fulfilled" ? aniResult.value : [];

        const jikanCharacters =
            jikanResult.status === "fulfilled" ? jikanResult.value : [];

        if (aniResult.status === "rejected") {
            console.error("AniList search failed:", aniResult.reason);
        }

        if (jikanResult.status === "rejected") {
            console.error("Jikan Edge search failed:", jikanResult.reason);
        }

        const characters = [
            ...aniCharacters.map(char => ({
                ...char,
                source: "anilist"
            })),
            ...jikanCharacters
        ];

        return res.status(200).json({
            data: {
                Page: {
                    characters
                }
            },
            providers: {
                anilist: aniResult.status === "fulfilled",
                jikanEdge: jikanResult.status === "fulfilled"
            }
        });

    } catch (error) {
        console.error("Character API error:", error);

        return res.status(500).json({
            error: "Character API request failed",
            details: error.message
        });
    }
}