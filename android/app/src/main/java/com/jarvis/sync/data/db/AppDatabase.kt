package com.jarvis.sync.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [SessionEntity::class, PendingMessage::class, SyncLogEntry::class, DashboardCache::class, ImportedSms::class],
    version = 2,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun sessionDao(): SessionDao
    abstract fun pendingDao(): PendingDao
    abstract fun syncLogDao(): SyncLogDao
    abstract fun dashboardDao(): DashboardDao
    abstract fun importedSmsDao(): ImportedSmsDao

    companion object {
        /** v2: Inbox backfill — remember imported inbox ids and carry the inbox id through queue → log. */
        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS imported_sms (smsId INTEGER NOT NULL, PRIMARY KEY(smsId))")
                db.execSQL("ALTER TABLE pending_message ADD COLUMN smsId INTEGER")
                db.execSQL("ALTER TABLE sync_log ADD COLUMN smsId INTEGER")
            }
        }

        @Volatile
        private var instance: AppDatabase? = null

        fun get(context: Context): AppDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "jarvis-sync.db",
                ).addMigrations(MIGRATION_1_2).fallbackToDestructiveMigration().build().also { instance = it }
            }
    }
}
