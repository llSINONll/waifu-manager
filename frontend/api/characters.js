export default async function handler(req, res) {
    try {
        const { q } = req.query;

        if (!q) {
            return res.status(400).json({
                error: "Missing search query"
            });
        }

        const jikanUrl =
            `https://api.jikan.moe/v4/characters?q=${encodeURIComponent(q)}&limit=25`;

        const response = await fetch(jikanUrl);

        if (!response.ok) {
            const errorText = await response.text();

            return res.status(response.status).json({
                error: "Jikan API error",
                details: errorText
            });
        }

        const data = await response.json();

        return res.status(200).json(data);

    } catch (error) {
        console.error("Jikan proxy error:", error);

        return res.status(500).json({
            error: "Failed to contact Jikan API",
            details: error.message
        });
    }
}