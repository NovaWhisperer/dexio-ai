const { Pinecone } = require('@pinecone-database/pinecone')

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

const chatgptClone = pc.Index("chatgpt-clone")

async function createMemory({ vectors, metadata, messageId }) {
    if (!vectors || vectors.length === 0) {
        console.error("createMemory: vectors is empty/undefined")
        return
    }

    await chatgptClone.upsert({
        records: [{
            id: messageId,
            values: vectors,
            metadata
        }]
    })
}

async function queryMemory({ queryVector, limit = 5, metadata }) {
    if (!queryVector || queryVector.length === 0) {
        console.error("queryMemory: queryVector is empty/undefined")
        return []
    }

    const data = await chatgptClone.query({
        vector: queryVector,
        topK: limit,
        filter: metadata ? metadata : undefined,
        includeMetadata: true
    })

    // ✅ Only return matches that are actually semantically relevant
    // Without this, Pinecone always returns `limit` results even if unrelated
    return data.matches.filter(match => match.score > 0.75)
}

async function deleteMemoriesByChat(vectorIds) {
    if (!vectorIds || vectorIds.length === 0) return
    await chatgptClone.deleteMany({ ids: vectorIds })
}

module.exports = { createMemory, queryMemory, deleteMemoriesByChat }
