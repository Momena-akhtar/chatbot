const ytdl = require("youtube-dl-exec");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const fs = require("fs");
const path = require("path");

ffmpeg.setFfmpegPath(ffmpegPath);

const getVideoUrls = async (channelUrl) => {
    try {
        const videoList = await ytdl(channelUrl, {
            dumpSingleJson: true,
            noWarnings: true,
            flatPlaylist: true, // Get only video URLs without extra details
        });
        return videoList.entries.map(video => video.url);
    } catch (error) {
        console.error("Failed to fetch video URLs:", error);
        return [];
    }
};

const downloadAudio = async (videoUrl, index) => {
    try {
        const outputFile = path.join(__dirname, `output_${index}.mp3`);
        console.log(`Downloading audio for: ${videoUrl}`);

        // Step 1: Get best audio format
        const videoInfo = await ytdl(videoUrl, {
            dumpSingleJson: true,
            noWarnings: true,
            preferFreeFormats: true,
        });

        const audioUrl = videoInfo.url;

        // Step 2: Convert audio to MP3
        ffmpeg(audioUrl)
            .audioCodec("libmp3lame")
            .toFormat("mp3")
            .on("end", () => {
                console.log(`Downloaded: ${outputFile}`);
            })
            .on("error", (err) => {
                console.error("Error:", err);
            })
            .save(outputFile);
    } catch (error) {
        console.error("Download failed:", error);
    }
};

const downloadChannelAudios = async (channelUrl) => {
    const videoUrls = await getVideoUrls(channelUrl);
    console.log(`Found ${videoUrls.length} videos.`);
    
    for (let i = 0; i < videoUrls.length; i++) {
        await downloadAudio(videoUrls[i], i);
    }
};

// Test with a YouTube channel URL
downloadChannelAudios("https://www.youtube.com/c/CHANNEL_NAME");
