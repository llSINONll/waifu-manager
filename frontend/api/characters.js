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

        console.log("Requesting Jikan:", jikanUrl);

        const response = await fetch(jikanUrl, {
            headers: {
                "User-Agent": "WaifuManager/1.0"
            }
        });

        console.log("Jikan status:", response.status);

        const text = await response.text();

        console.log("Jikan response:", text);

        if (!response.ok) {
            return res.status(502).json({
                error: "Jikan API returned an error",
                jikanStatus: response.status,
                details: text
            });
        }

        let data;

        try {
            data = JSON.parse(text);
        } catch (parseError) {
            return res.status(502).json({
                error: "Jikan returned invalid JSON",
                details: text
            });
        }

        return res.status(200).json(data);

    } catch (error) {
        console.error("Jikan proxy error:", error);

        return res.status(502).json({
            error: "Failed to contact Jikan API",
            details: error.message,
            name: error.name
        });
    }
}