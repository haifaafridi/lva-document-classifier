process.env.MILVUS_COLLECTION = process.env.MILVUS_ALL_LOCALITY_COLLECTION || 'GS_Schedules_All_Localities';
await import('./milvusStatus.js');
