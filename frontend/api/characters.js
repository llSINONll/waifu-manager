export default async function handler(req, res) {
    try {
        const { q } = req.query;

        if (!q || !q.trim()) {
            return res.status(400).json({
                error: "Missing search query"
            });
        }

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

        const response = await fetch("https://graphql.anilist.co", {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },

            body: JSON.stringify({
                query,
                variables: {
                    search: q.trim()
                }
            })
        });

        const text = await response.text();

        if (!response.ok) {
            console.error("AniList API Error:", response.status, text);

            return res.status(502).json({
                error: "AniList API error",
                status: response.status,
                details: text
            });
        }

        const data = JSON.parse(text);

        if (data.errors) {
            console.error("AniList GraphQL Error:", data.errors);

            return res.status(502).json({
                error: "AniList GraphQL error",
                details: data.errors
            });
        }

        return res.status(200).json(data);

    } catch (error) {
        console.error("AniList proxy error:", error);

        return res.status(500).json({
            error: "Failed to contact AniList API",
            details: error.message
        });
    }
}