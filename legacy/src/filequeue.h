#ifndef FILEQUEUE_H
#define FILEQUEUE_H

#pragma once

#include <QQueue>
#include <QStringList>
#include <functional>

class FileQueue {
public:
    FileQueue();

    // Set this to your processing lambda, e.g. [this](const QString &file){ processAudioFile(file); }
    void setProcessor(std::function<void(const QString&)> processor);

    // Enqueue files and start processing if idle
    void enqueueFilesAndStart(const QStringList &files);

    // Called when one file is finished to trigger the next
    void startNext();

    // Check if currently processing
    bool isProcessing() const { return processing; }
    bool isEmpty() const { return queue.isEmpty(); }
    void clear();

private:
    QQueue<QString> queue;
    bool processing = false;
    std::function<void(const QString&)> processFunc;
};

#endif // FILEQUEUE_H
