import speech from "@google-cloud/speech"
import fs from "fs"
import { config } from "process"


//create a client first
const client = new speech.SpeechClient()


//function for audio transcription
async function transcribeGoogle(audioPath){
    const audio = {
        content: fs.readFileSync(audioPath).toString("base64")
    }
    //make a request for sending the data for transcription
    const request  = {
        audio: audio,
        config: { encoding: "MP3", sampleRateHertz: 16000, languageCode: "en-US"}
    }
    //send a request and wait for response (transcribed text)
    const [response] = await client.recognize(request)
    console.log("Transcription:", response.results.map(r => r.alternatives[0].transcript).join(" "));
} 
transcribeGoogle("output.mp3")