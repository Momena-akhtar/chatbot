const fs = require("fs");
const puppeteer = require("puppeteer");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegStatic = require("ffmpeg-static");

ffmpeg.setFfmpegPath(ffmpegStatic);

/**
 * Scrapes Instagram to get the video URL
 * @param {string} postUrl - Instagram reel/video post URL
 * @returns {string} - Direct video URL
 */
async function getInstagramVideoUrl(postUrl) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // Set headers to mimic a real browser
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

    await page.goto(postUrl, { waitUntil: "networkidle2" });

    // Extract video URL from Instagram
    const videoUrl = await page.evaluate(() => {
        const videoElement = document.querySelector("video");
        return videoElement ? videoElement.src : null;
    });

    await browser.close();

    if (!videoUrl) throw new Error("Video URL not found.");
    return videoUrl;
}

/**
 * Downloads the full Instagram video
 * @param {string} videoUrl - Direct Instagram video URL
 * @param {string} outputPath - Path to save the video
 */
async function downloadVideo(videoUrl, outputPath) {
    const response = await axios({
        url: videoUrl,
        method: "GET",
        responseType: "stream",
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Referer": "https://www.instagram.com/",
        },
    });

    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
    });
}

/**
 * Extracts audio from video
 * @param {string} videoPath - Path to downloaded video
 * @param {string} audioPath - Path to save extracted audio
 */
function extractAudio(videoPath, audioPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .output(audioPath)
            .noVideo()
            .audioCodec("libmp3lame")
            .on("end", () => {
                console.log("Audio extracted successfully!");
                resolve();
            })
            .on("error", (err) => reject(err))
            .run();
    });
}

(async () => {
    const postUrl = "https://www.instagram.com/p/C3kfq09CD3W/";
    const videoPath = "video41.mp4";
    const audioPath = "audios/audio41.mp3";

    try {
        console.log("Fetching video URL...");
        const videoUrl = await getInstagramVideoUrl(postUrl);
        console.log("Video URL:", videoUrl);

        console.log("Downloading video...");
        await downloadVideo(videoUrl, videoPath);

        console.log("Extracting audio...");
        await extractAudio(videoPath, audioPath);

        console.log("Audio saved as:", audioPath);
    } catch (error) {
        console.error("Error:", error);
    }
})();
