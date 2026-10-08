export default async function handler(req, res) {
    try {
        const { q } = req.query;

        if (!q) {
            return res.status(400).json({
                error: "Missing search query"
            });
        }

        const malUrl =
            `https://api.myanimelist.net/v2/people?q=${encodeURIComponent(q)}&limit=25&fields=first_name,last_name,nicknames,about,main_picture`;

        const response = await fetch(malUrl, {
            headers: {
                "X-MAL-CLIENT-ID": process.env.MAL_CLIENT_ID
            }
        });

        const text = await response.text();

        if (!response.ok) {
            console.error("MAL API Error:", response.status, text);

            return res.status(502).json({
                error: "MAL API error",
                status: response.status,
                details: text
            });
        }

        const data = JSON.parse(text);

        return res.status(200).json(data);

    } catch (error) {
        console.error("MAL proxy error:", error);

        return res.status(500).json({
            error: "Failed to contact MAL API",
            details: error.message
        });
    }
}